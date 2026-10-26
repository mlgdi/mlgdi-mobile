/// <reference types="@dcloudio/types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'mp-html' {
  const MpHtml: any
  export default MpHtml
}

declare const uni: any
