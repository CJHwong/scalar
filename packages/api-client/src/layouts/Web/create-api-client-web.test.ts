import { describe, expect, it } from 'vitest'

import { createApiClientWeb } from './create-api-client-web'

describe('createApiClientWeb', () => {
  it('renders something', async () => {
    const element = document.createElement('div')
    expect(element).not.toBeNull()

    expect(element.innerHTML).not.toContain('scalar-app')

    createApiClientWeb(element, {
      proxyUrl: 'https://proxy.scalar.com',
    })

    expect(element.innerHTML).toContain('scalar-app')
  })
})
