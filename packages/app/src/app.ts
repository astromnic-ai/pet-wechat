import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { getToken } from './utils/request'
import { connectWs } from './utils/ws'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    if (getToken()) {
      void connectWs()
    }

    console.log('App launched.')
  })

  // children 是将要被渲染的页面
  return children
}

export default App
