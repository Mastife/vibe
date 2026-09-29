import type { ProjectStatus } from '@projects-hq/contracts'

import { createBackendRuntime } from '../src/runtime'

const githubOwner = 'Mastife'

type SeedProject = {
  name: string
  slug: string
  repo: string
  status: ProjectStatus
  notes?: string
}

// Starting point imported from the owner's GitHub account; statuses are a guess from recent activity.
const seedProjects: SeedProject[] = [
  { name: 'Map', slug: 'map', repo: 'map', status: 'ACTIVE' },
  { name: 'Artemis HQ', slug: 'artemis-hq', repo: 'artemis-hq', status: 'ACTIVE' },
  { name: 'Moika', slug: 'moika', repo: 'moika', status: 'ACTIVE' },
  { name: 'Pumply', slug: 'pumply', repo: 'pumply', status: 'ACTIVE' },
  { name: 'Handi', slug: 'handi', repo: 'Handi', status: 'ACTIVE' },
  { name: 'Gifty', slug: 'gifty', repo: 'gifty', status: 'ACTIVE' },
  { name: 'HRPro Sales Agent', slug: 'hrpro-sales-agent', repo: 'hrpro-sales-agent', status: 'ACTIVE' },
  { name: 'Furniture BI Dashboard', slug: 'furniture-bi-dashboard', repo: 'furniture-bi-dashboard', status: 'ACTIVE' },
  {
    name: 'Checkpoint',
    slug: 'checkpoint',
    repo: 'checkpoint-backend',
    status: 'PAUSED',
    notes: `Фронтенд: https://github.com/${githubOwner}/checkpoint-front`,
  },
  { name: 'CS2 Skin Monitor', slug: 'cs2-skin-monitor', repo: 'cs2-skin-monitor', status: 'PAUSED' },
  { name: 'Relife', slug: 'relife', repo: 'relife', status: 'PAUSED' },
  { name: 'Murito', slug: 'murito', repo: 'Murito', status: 'ARCHIVED' },
  { name: 'Telegram Chatbot (Render)', slug: 'tlg-chatbot-render', repo: 'tlg-chatbot-render', status: 'ARCHIVED' },
  { name: 'Transform Bot', slug: 'transform-bot-murat', repo: 'transform-bot-murat', status: 'ARCHIVED' },
]

const importNote = 'Импортировано из GitHub при первичной настройке: уточните статус, сервер, клиента и адрес продакшена.'

export async function seed() {
  const runtime = createBackendRuntime()
  let created = 0

  try {
    for (const project of seedProjects) {
      const existing = await runtime.prisma.project.findUnique({ where: { slug: project.slug }, select: { id: true } })
      if (existing) continue

      await runtime.prisma.project.create({
        data: {
          name: project.name,
          slug: project.slug,
          status: project.status,
          repoUrl: `https://github.com/${githubOwner}/${project.repo}`,
          notes: [project.notes, importNote].filter(Boolean).join('\n'),
        },
      })
      created += 1
    }

    console.log(`Seed finished: ${created} projects created, ${seedProjects.length - created} already existed.`)
  } finally {
    await runtime.close()
  }
}

if (import.meta.main) {
  await seed()
}
