import { e2ePassword, expect, test, uniqueEmail } from '../helpers/test'

const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3000'

test('first admin sets up the panel, tracks a project, a server payment, and signs back in', async ({ page }) => {
  const email = uniqueEmail('hq-admin')
  const projectName = `Мойка ${Date.now()}`

  await page.goto('/')

  // First run: registration is offered by default and validation is visible before any request.
  await expect(page.getByRole('heading', { name: 'Projects HQ' })).toBeVisible()
  await page.getByRole('button', { name: 'Создать аккаунт' }).click()
  await expect(page.getByText('Неверный email адрес')).toBeVisible()
  await expect(page.getByText('Пароль должен быть не короче 8 символов')).toBeVisible()

  await page.getByLabel('Имя', { exact: true }).fill('Владелец')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Пароль', { exact: true }).fill(e2ePassword)
  await page.getByRole('button', { name: 'Создать аккаунт' }).click()

  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible()
  await expect(page.getByText('Пока нечего проверять')).toBeVisible()

  // Session survives a reload through the HttpOnly refresh cookie.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible()

  // Client.
  await page.getByRole('link', { name: 'Клиенты', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить клиента' }).first().click()
  await page.getByLabel('Название', { exact: true }).fill('ООО Ромашка')
  await page.getByLabel('Email', { exact: true }).fill('pay@romashka.ru')
  await page.getByRole('button', { name: 'Добавить клиента' }).last().click()
  await expect(page.getByRole('cell', { name: 'ООО Ромашка' })).toBeVisible()

  // Server due in three days.
  const dueSoon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  await page.getByRole('link', { name: 'Серверы', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить сервер' }).first().click()
  await page.getByLabel('Название', { exact: true }).fill('vps-1')
  await page.getByLabel('Провайдер', { exact: true }).fill('Timeweb')
  await page.getByLabel('Стоимость за период', { exact: true }).fill('1500')
  await page.getByLabel('Оплачен до', { exact: true }).fill(dueSoon)
  await page.getByRole('button', { name: 'Добавить сервер' }).last().click()
  await expect(page.getByRole('cell', { name: /vps-1/ })).toBeVisible()
  await expect(page.getByText('Оплатить через 3 дня')).toBeVisible()

  // Project monitored through the backend's own health endpoint.
  await page.getByRole('link', { name: 'Проекты', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить проект' }).first().click()
  await page.getByLabel('Название', { exact: true }).fill(projectName)
  await page.getByLabel('Клиент', { exact: true }).selectOption({ label: 'ООО Ромашка' })
  await page.getByLabel('Сервер', { exact: true }).selectOption({ label: 'vps-1' })
  await page.getByRole('tab', { name: 'Мониторинг' }).click()
  await page.getByLabel('Адрес продакшена', { exact: true }).fill(`${backendUrl}/health`)
  await page.getByRole('button', { name: 'Создать проект' }).click()
  await expect(page.getByRole('link', { name: projectName })).toBeVisible()

  await page.getByRole('button', { name: 'Проверить сейчас' }).click()
  await expect(page.getByText('Работает', { exact: true })).toBeVisible()

  // Dashboard reflects the new state.
  await page.getByRole('link', { name: 'Обзор', exact: true }).click()
  await expect(page.getByRole('link', { name: projectName })).toBeVisible()
  await expect(page.getByText('Сервер vps-1: оплата через 3 дня')).toBeVisible()

  // Recording a payment pushes the paid period forward.
  await page.getByRole('link', { name: 'Серверы', exact: true }).click()
  await page.getByRole('button', { name: 'Оплатить' }).click()
  await page.getByRole('button', { name: 'Записать оплату' }).click()
  await expect(page.getByText(/Оплачен до/)).toBeVisible()
  await expect(page.getByText('Оплатить через 3 дня')).toHaveCount(0)

  // Logout, then registration is closed and login works.
  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Регистрация' })).toHaveCount(0)

  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Пароль', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Неверный email или пароль')).toBeVisible()

  await page.getByLabel('Пароль', { exact: true }).fill(e2ePassword)
  await page.getByRole('button', { name: 'Войти' }).click()
  // The router keeps the last location, so the shell reopens on the servers page.
  await expect(page.getByRole('heading', { name: 'Серверы' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
})
