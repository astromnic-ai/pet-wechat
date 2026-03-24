import { View, Text, Image, Button, Checkbox } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { setToken } from '../../utils/request'
import { isFirstLogin, setUserInfo } from '../../utils/storage'
import { setMockMode } from '../../mock/mode'
import './index.scss'

export default function Login() {
  const [agreedTerms, setAgreedTerms] = useState(true)
  const [agreedPrivacy, setAgreedPrivacy] = useState(true)

  const navigateAfterLogin = () => {
    if (isFirstLogin()) {
      Taro.reLaunch({ url: '/pages/guide/index' })
      return
    }

    Taro.switchTab({ url: '/pages/index/index' })
  }

  const handleMockLogin = (loginType: 'phone' | 'wechat') => {
    if (!agreedTerms || !agreedPrivacy) {
      Taro.showToast({
        title: '请先勾选协议',
        icon: 'none',
      })
      return
    }

    setMockMode(true)
    Taro.removeStorageSync('hasCompletedGuide')
    setToken(`mock-token-${loginType}`)
    setUserInfo({
      id: `mock-user-${loginType}`,
      nickname: loginType === 'phone' ? 'Mock手机号用户' : 'Mock微信用户',
      avatarUrl: '',
      loginType,
    })

    Taro.showToast({
      title: 'Mock登录成功',
      icon: 'success',
      duration: 800,
    })

    setTimeout(() => {
      navigateAfterLogin()
    }, 300)
  }

  return (
    <View className='login-page'>
      <View className='logo'>YEHEY</View>

      <View className='circle-box'>
        <Image
          src={require('@/assets/images/pet_logo.png')}
          mode='aspectFit'
          className='pet-img'
        />
      </View>

      <Text className='title'>欢迎来到宠物新世界</Text>

      <View className='btn-box'>
        <Button className='btn btn-disabled' onClick={() => handleMockLogin('phone')}>
          本机号码快捷登录
        </Button>
        <Button className='btn btn-normal' onClick={() => handleMockLogin('wechat')}>
          微信账号登录
        </Button>
      </View>

      <View className='agreement'>
        <View className='agreement-title'>
          <Text>本人已阅读并同意以下条款</Text>
        </View>
        <View
          className='agreement-item'
          onClick={() => setAgreedTerms((prev) => !prev)}
        >
          <Checkbox checked={agreedTerms} />
          <Text>我同意《YEHEY平台个人及宠物信息收集声明》中所述与第三方共享信息</Text>
        </View>
        <View
          className='agreement-item'
          onClick={() => setAgreedPrivacy((prev) => !prev)}
        >
          <Checkbox checked={agreedPrivacy} />
          <Text>我已阅读关于七七七八八八九九九六六的《xxxxxx细则》</Text>
        </View>
      </View>

      <View className='register'>
        <Text>还没有账号？立即注册</Text>
      </View>
    </View>
  )
}
