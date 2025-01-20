import type {
  RouteLocationAsPath,
  RouteLocationAsRelative,
  RouteLocationAsString,
  RouteLocationNormalizedLoaded,
  RouteLocationRaw,
  RouteLocationResolved,
  RouteLocationResolvedGeneric,
  RouteLocationNormalizedGeneric,
} from 'vue-router'
import { useTranslationHelper, interpolate, isNoPrefixStrategy, RouteService, FormatService } from 'nuxt-i18n-micro-core'
import type { ModuleOptionsExtend, Locale, I18nRouteParams, Params, Translation, Translations } from 'nuxt-i18n-micro-types'
import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { useRouter, useCookie, useState, unref, navigateTo } from '#imports'
import { plural } from '#build/i18n.plural.mjs'

const i18nHelper = useTranslationHelper()
const isDev = process.env.NODE_ENV !== 'production'

export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig()
  const i18nConfig: ModuleOptionsExtend = config.public.i18nConfig as unknown as ModuleOptionsExtend
  const apiBaseUrl = i18nConfig.apiBaseUrl ?? '_locales'
  const router = useRouter()
  const runtimeConfig = useRuntimeConfig()

  let hashLocaleDefault: null | string | undefined = null
  let noPrefixDefault: null | string | undefined = null

  if (i18nConfig.hashMode) {
    hashLocaleDefault = await nuxtApp.runWithContext(() => useCookie('hash-locale').value)
  }
  if (isNoPrefixStrategy(i18nConfig.strategy!)) {
    noPrefixDefault = await nuxtApp.runWithContext(() => useCookie('no-prefix-locale').value)
  }

  const routeService = new RouteService(
    i18nConfig,
    router,
    hashLocaleDefault,
    noPrefixDefault,
    (to, options) => navigateTo(to, options),
    (name, value) => {
      nuxtApp.runWithContext(() => {
        return useCookie(name).value = value
      })
    },
  )
  const translationService = new FormatService()

  const i18nRouteParams = useState<I18nRouteParams>('i18n-route-params', () => ({}))
  nuxtApp.hook('page:start', () => {
    // Cleaning route-params on client side only
    i18nRouteParams.value = null
  })

  const loadTranslationsIfNeeded = async (locale: string, routeName: string, path: string) => {
    try {
      if (!i18nHelper.hasPageTranslation(locale, routeName)) {
        let fRouteName = routeName
        if (i18nConfig.routesLocaleLinks && i18nConfig.routesLocaleLinks[fRouteName]) {
          fRouteName = i18nConfig.routesLocaleLinks[fRouteName]
        }

        if (!fRouteName || fRouteName === '') {
          console.warn(`[nuxt-i18n-next] The page name is missing in the path: ${path}. Please ensure that definePageMeta({ name: 'pageName' }) is set.`)
          return
        }

        const url = `/${apiBaseUrl}/${fRouteName}/${locale}/data.json`.replace(/\/{2,}/g, '/')
        const data: Translations = await $fetch(url, {
          baseURL: runtimeConfig.app.baseURL,
          params: {
            v: i18nConfig.dateBuild,
          },
        })
        await i18nHelper.loadPageTranslations(locale, routeName, data ?? {})
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    catch (_error) { /* empty */ }
  }

  async function loadGlobalTranslations(
    to: RouteLocationNormalizedGeneric,
  ) {
    let locale = routeService.getCurrentLocale(to)
    if (i18nConfig.hashMode) {
      locale = await nuxtApp.runWithContext(() => {
        return useCookie('hash-locale', { default: () => locale }).value
      })
    }
    if (isNoPrefixStrategy(i18nConfig.strategy!)) {
      locale = await nuxtApp.runWithContext(() => {
        return useCookie('no-prefix-locale', { default: () => locale }).value
      })
    }

    if (!i18nHelper.hasGeneralTranslation(locale)) {
      const url = `/${apiBaseUrl}/general/${locale}/data.json`.replace(/\/{2,}/g, '/')
      const data: Translations = await $fetch(url, {
        baseURL: runtimeConfig.app.baseURL,
        params: {
          v: i18nConfig.dateBuild,
        },
      })
      await i18nHelper.loadTranslations(locale, data ?? {})
    }

    if (!i18nConfig.disablePageLocales) {
      const locale = routeService.getCurrentLocale(to)
      const routeName = routeService.getRouteName(to, locale)
      await loadTranslationsIfNeeded(locale, routeName, to.fullPath)
    }

    // Ensure i18n hook is called after all translations are loaded
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    await nuxtApp.callHook('i18n:register', (translations: Translations, selectedLocale?: string) => {
      const locale = routeService.getCurrentLocale(to)
      const routeName = routeService.getRouteName(to, locale)
      i18nHelper.mergeTranslation(selectedLocale ?? locale, routeName, translations, true)
    }, locale)
  }

  router.beforeEach(async (to, from, next) => {
    if (to.path !== from.path || isNoPrefixStrategy(i18nConfig.strategy!)) {
      await loadGlobalTranslations(to)
    }
    if (next) {
      next()
    }
  })

  await loadGlobalTranslations(router.currentRoute.value)

  const provideData = {
    i18n: undefined,
    __micro: true,
    getLocale: () => routeService.getCurrentLocale(),
    getLocaleName: () => routeService.getCurrentName(routeService.getCurrentRoute()),
    defaultLocale: () => i18nConfig.defaultLocale,
    getLocales: () => i18nConfig.locales || [],
    getRouteName: (route?: RouteLocationNormalizedLoaded | RouteLocationResolvedGeneric, locale?: string) => {
      const selectedLocale = locale ?? routeService.getCurrentLocale()
      const selectedRoute = route ?? routeService.getCurrentRoute()
      return routeService.getRouteName(selectedRoute, selectedLocale)
    },
    t: (key: string, params?: Params, defaultValue?: string): Translation => {
      if (!key) return ''
      const route = routeService.getCurrentRoute()
      const locale = routeService.getCurrentLocale()
      const routeName = routeService.getRouteName(route, locale)
      let value = i18nHelper.getTranslation(locale, routeName, key)

      if (!value) {
        if (isDev && import.meta.client) {
          console.warn(`Not found '${key}' key in '${locale}' locale messages.`)
        }
        value = defaultValue || key
      }

      return typeof value === 'string' && params ? interpolate(value, params) : value
    },
    ts: (key: string, params?: Params, defaultValue?: string): string => {
      const value = provideData.t(key, params, defaultValue)
      return value?.toString() ?? defaultValue ?? key
    },
    tc: (key: string, params: number | Params, defaultValue?: string): string => {
      const currentLocale = routeService.getCurrentLocale()
      const { count, ..._params } = typeof params === 'number' ? { count: params } : params

      return plural(key, Number.parseInt(count.toString()), _params, currentLocale, provideData.t) as string ?? defaultValue ?? key
    },
    tn: (value: number, options?: Intl.NumberFormatOptions) => {
      const currentLocale = routeService.getCurrentLocale()
      return translationService.formatNumber(value, currentLocale, options)
    },
    td: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => {
      const currentLocale = routeService.getCurrentLocale()
      return translationService.formatDate(value, currentLocale, options)
    },
    tdr: (value: Date | number | string, options?: Intl.RelativeTimeFormatOptions): string => {
      const currentLocale = routeService.getCurrentLocale()
      return translationService.formatRelativeTime(value, currentLocale, options)
    },
    has: (key: string): boolean => {
      return !!provideData.t(key)
    },
    mergeTranslations: (newTranslations: Translations) => {
      const route = routeService.getCurrentRoute()
      const locale = routeService.getCurrentLocale(route)
      const routeName = routeService.getRouteName(route, locale)
      i18nHelper.mergeTranslation(locale, routeName, newTranslations)
    },
    mergeGlobalTranslations: (newTranslations: Translations) => {
      const locale = routeService.getCurrentLocale()
      i18nHelper.mergeGlobalTranslation(locale, newTranslations, true)
    },
    switchLocaleRoute: (toLocale: string) => {
      const route = routeService.getCurrentRoute()
      const fromLocale = routeService.getCurrentLocale(route)
      return routeService.switchLocaleRoute(fromLocale, toLocale, route, unref(i18nRouteParams.value))
    },
    switchLocalePath: (toLocale: string) => {
      const route = routeService.getCurrentRoute()
      const fromLocale = routeService.getCurrentLocale(route)
      const localeRoute = routeService.switchLocaleRoute(fromLocale, toLocale, route, unref(i18nRouteParams.value))
      if (typeof localeRoute === 'string') {
        return localeRoute
      }
      if ('fullPath' in localeRoute) {
        return localeRoute.fullPath as string
      }
      return ''
    },
    switchLocale: (toLocale: string) => {
      return routeService.switchLocaleLogic(toLocale, unref(i18nRouteParams.value))
    },
    switchRoute: (route: RouteLocationNormalizedLoaded | RouteLocationResolvedGeneric | string, toLocale?: string) => {
      return routeService.switchLocaleLogic(toLocale ?? routeService.getCurrentLocale(), unref(i18nRouteParams.value), route)
    },
    localeRoute: (to: RouteLocationAsString | RouteLocationAsRelative | RouteLocationAsPath | string, locale?: string): RouteLocationResolved => {
      return routeService.resolveLocalizedRoute(to, locale)
    },
    localePath: (to: RouteLocationAsString | RouteLocationAsRelative | RouteLocationAsPath, locale?: string): string => {
      const localeRoute = routeService.resolveLocalizedRoute(to, locale)
      if (typeof localeRoute === 'string') {
        return localeRoute
      }
      if ('fullPath' in localeRoute) {
        return localeRoute.fullPath as string
      }
      return ''
    },
    setI18nRouteParams: (value: I18nRouteParams) => {
      i18nRouteParams.value = value
      return i18nRouteParams.value
    },
  }

  const $provideData = Object.fromEntries(
    Object.entries(provideData).map(([key, value]) => [`$${key}`, value]),
  )

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  provideData.i18n = { ...provideData, ...$provideData }

  nuxtApp.vueApp.config.globalProperties.$t = provideData.t
  nuxtApp.vueApp.config.globalProperties.$ts = provideData.ts
  nuxtApp.vueApp.config.globalProperties.$tc = provideData.tc
  nuxtApp.vueApp.config.globalProperties.$tn = provideData.tn
  nuxtApp.vueApp.config.globalProperties.$td = provideData.td
  nuxtApp.vueApp.config.globalProperties.$tdr = provideData.tdr
  nuxtApp.vueApp.config.globalProperties.$switchLocale = provideData.switchLocale
  nuxtApp.vueApp.config.globalProperties.$switchLocaleRoute = provideData.switchLocaleRoute

  return {
    provide: provideData,
  }
})

export interface PluginsInjections {
  $getLocale: () => string
  $getLocaleName: () => string | null
  $getLocales: () => Locale[]
  $defaultLocale: () => string | undefined
  $getRouteName: (route?: RouteLocationNormalizedLoaded | RouteLocationResolvedGeneric, locale?: string) => string
  $t: (key: string, params?: Params, defaultValue?: string) => Translation
  $ts: (key: string, params?: Params, defaultValue?: string) => string
  $tc: (key: string, params: number | Params, defaultValue?: string) => string
  $tn: (value: number, options?: Intl.NumberFormatOptions) => string
  $td: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string
  $tdr: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string
  $has: (key: string) => boolean
  $mergeTranslations: (newTranslations: Translations) => void
  $mergeGlobalTranslations: (newTranslations: Translations) => void
  $switchLocaleRoute: (locale: string) => RouteLocationRaw
  $switchLocalePath: (locale: string) => string
  $switchLocale: (locale: string) => void
  $switchRoute: (route: RouteLocationNormalizedLoaded | RouteLocationResolvedGeneric | string, toLocale?: string) => void
  $localeRoute: (to: RouteLocationAsString | RouteLocationAsRelative | RouteLocationAsPath, locale?: string) => RouteLocationResolved
  $localePath: (to: RouteLocationAsString | RouteLocationAsRelative | RouteLocationAsPath, locale?: string) => string
  $setI18nRouteParams: (value: I18nRouteParams) => I18nRouteParams
}
