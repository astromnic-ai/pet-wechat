import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { getToken } from './utils/request'
import { connectWs } from './utils/ws'
import './app.scss'

declare const ENABLE_DEV_LOGIN: boolean

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // In local dev we bypass WeChat auth and often serve from localhost.
    // DevTools may block ws://localhost unless domain checks are disabled,
    // so skip eager websocket boot to avoid startup blank screens.
    if (getToken() && !ENABLE_DEV_LOGIN) {
      void connectWs()
    }

    console.log('App launched.')
  })

  // children 是将要被渲染的页面
  return children
}

export default App
