import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    MyModule, '@nuxt/content',
  ],
  devtools: { enabled: true },
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  content: {
    documentDriven: true,
  },
  compatibilityDate: '2024-04-03',
  i18n: {
    locales: [
      { code: 'en', iso: 'en-US', dir: 'ltr', displayName: 'English' },
      { code: 'cs', iso: 'cs-CZ', dir: 'ltr', displayName: 'Czech' },
    ],
    defaultLocale: 'en',
    translationDir: 'locales',
    meta: false,
    strategy: 'prefix_except_default',
  },
})
