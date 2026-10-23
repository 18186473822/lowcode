/** MaterialMarketPanel：配置门禁、刷新验签、安装后插入受控组件。 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MaterialMarketPanel from '../src/panel/MaterialMarketPanel.vue'
import type { RemoteMaterialManifest, SignedManifestEnvelope } from '@lc/materials'
import { canonicalJson } from '@lc/materials'

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function pem(bytes: ArrayBuffer): string {
  const lines = b64(new Uint8Array(bytes)).match(/.{1,64}/g) ?? []
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

async function envelope(): Promise<{ body: SignedManifestEnvelope; publicKey: string }> {
  const manifest: RemoteMaterialManifest = {
    schemaVersion: 1,
    name: '测试市场',
    generatedAt: '2026-10-23T00:00:00.000Z',
    materials: [
      {
        id: 'brand-button',
        name: '品牌按钮',
        version: '1.0.0',
        kind: 'component',
        component: 'Button',
        meta: {
          name: 'BrandButton',
          title: '品牌按钮',
          version: '1.0.0',
          category: 'basic',
          defaultProps: { text: '立即提交' },
          settings: [],
        },
      },
    ],
  }
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    new TextEncoder().encode(canonicalJson(manifest)),
  )
  return {
    body: { alg: 'ES256', signature: b64(new Uint8Array(signature)), manifest },
    publicKey: pem(await crypto.subtle.exportKey('spki', pair.publicKey)),
  }
}

describe('MaterialMarketPanel', () => {
  it('未配置时不发请求，只显示配置指引', () => {
    const wrapper = mount(MaterialMarketPanel)
    expect(wrapper.find('[data-testid="market-unconfigured"]').text()).toContain('VITE_LC_MATERIAL_MARKET_URL')
  })

  it('刷新验签 → 安装 → 插入受控组件', async () => {
    const { body, publicKey } = await envelope()
    // 组件在 onMounted 时构造 registry，因此必须在 mount 前注入 fetch。
    const original = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch
    try {
      const wrapper = mount(MaterialMarketPanel, {
        props: {
          manifestUrl: 'https://market.example.com/manifest.json',
          allowlist: ['https://market.example.com'],
          publicKeyPem: publicKey,
        },
      })
      await wrapper.find('[data-testid="market-refresh"]').trigger('click')
      await flushPromises()
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="market-notice"]').exists()).toBe(true)
      })
      expect(wrapper.find('[data-testid="market-notice"]').text()).toContain('验签通过')
      expect(wrapper.find('[data-testid="market-list"]').text()).toContain('品牌按钮')

      await wrapper.find('[data-testid="market-install-brand-button"]').trigger('click')
      expect(wrapper.find('[data-testid="market-insert-brand-button"]').exists()).toBe(true)
      await wrapper.find('[data-testid="market-insert-brand-button"]').trigger('click')
      const events = wrapper.emitted('insert')
      expect(events).toHaveLength(1)
      expect((events![0][0] as { component: string }).component).toBe('Button')
    } finally {
      globalThis.fetch = original
    }
  })
})
