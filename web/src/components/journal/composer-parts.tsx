import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Typography } from '@/components/ui/typography'

const modifierKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

/** "Ctrl Enter записать" under a form; desktop only, a phone has no such keys. */
export function ShortcutHint({ keys, action }: { keys: 'enter' | 'mod-enter'; action: string }) {
  return (
    <Typography as="span" variant="caption" tone="muted" className="hidden items-center gap-1.5 md:flex">
      <KbdGroup>
        {keys === 'mod-enter' && <Kbd>{modifierKey}</Kbd>}
        <Kbd>Enter</Kbd>
      </KbdGroup>
      {action}
    </Typography>
  )
}

type ChoiceOption<T extends string> = { value: T; label: string }

type SegmentedChoiceProps<T extends string> = {
  options: Array<ChoiceOption<T>>
  /** '' leaves every option unpicked, e.g. when a custom date matches none of them. */
  value: T | ''
  onChange: (value: T) => void
  'aria-labelledby'?: string
}

/** One-of-a-few picker such as "Сейчас / Вчера / Другое время", with the picked option clearly filled. */
export function SegmentedChoice<T extends string>({ options, value, onChange, ...props }: SegmentedChoiceProps<T>) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      // Separate chips that wrap, so a row of options never pushes past a phone's screen.
      spacing={1}
      className="max-w-full flex-wrap"
      value={value}
      // Radix reports '' when the picked option is clicked again; keep the current choice then.
      onValueChange={(next) => next !== '' && onChange(next as T)}
      {...props}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          // The kit's pressed tint is too faint to tell which option is picked.
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
