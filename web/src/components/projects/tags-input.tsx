import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import { Typography } from '@/components/ui/typography'
import { useTags } from '@/lib/queries'

type TagsInputProps = {
  id: string
  value: string[]
  onChange: (tags: string[]) => void
  invalid?: boolean
}

const maxTagLength = 32

/**
 * Multi-select over the tags already used across projects. Creating a tag is a separate action
 * (button or Enter with no matches) rather than a synthetic list item, which the combobox would
 * drop while it clears the query on selection.
 */
export function TagsInput({ id, value, onChange, invalid }: TagsInputProps) {
  const anchorRef = useComboboxAnchor()
  const tags = useTags()
  const [query, setQuery] = useState('')
  // Radix modals disable pointer events outside their content, so the popup must render inside the dialog.
  const [container, setContainer] = useState<HTMLElement | null>(null)

  const counts = useMemo(() => new Map((tags.data?.tags ?? []).map((tag) => [tag.name, tag.count])), [tags.data])
  const known = useMemo(() => [...new Set([...counts.keys(), ...value])], [counts, value])
  const draft = query.trim().slice(0, maxTagLength)
  const needle = draft.toLowerCase()
  const matches = needle
    ? known
        .filter((tag) => tag.toLowerCase().includes(needle))
        .sort((a, b) => Number(b.toLowerCase() === needle) - Number(a.toLowerCase() === needle))
    : known
  const canCreate = draft !== '' && !known.some((tag) => tag.toLowerCase() === needle)

  function create() {
    if (!canCreate) return
    onChange([...value, draft])
    setQuery('')
  }

  return (
    <Combobox
      multiple
      autoHighlight
      items={matches}
      filter={null}
      value={value}
      onValueChange={(next: string[]) => {
        onChange(next)
        setQuery('')
      }}
      inputValue={query}
      onInputValueChange={setQuery}
    >
      <ComboboxChips
        ref={(node: HTMLDivElement | null) => {
          anchorRef.current = node
          setContainer(node?.closest<HTMLElement>('[role=dialog]') ?? null)
        }}
        aria-invalid={invalid || undefined}
      >
        <ComboboxValue>
          {(selected: string[]) => (
            <>
              {selected.map((tag) => (
                <ComboboxChip key={tag}>{tag}</ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                maxLength={maxTagLength}
                placeholder={selected.length === 0 ? 'Выберите или введите тег' : ''}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && matches.length === 0 && canCreate) {
                    event.preventDefault()
                    create()
                  }
                }}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef} container={container ?? undefined}>
        {!canCreate && <ComboboxEmpty>Тегов пока нет — введите название</ComboboxEmpty>}
        <ComboboxList>
          {(tag: string) => (
            <ComboboxItem key={tag} value={tag}>
              <span className="flex w-full items-center justify-between gap-3">
                <Typography as="span" variant="bodySm">
                  {tag}
                </Typography>
                {counts.has(tag) && (
                  <Typography as="span" variant="caption" tone="muted">
                    {counts.get(tag)}
                  </Typography>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
        {canCreate && (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              // Keep focus in the input so the popup does not close before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={create}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              {`Создать тег «${draft}»`}
            </Button>
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
