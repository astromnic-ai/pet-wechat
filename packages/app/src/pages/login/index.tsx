import { View, Text, Image, Button, Checkbox } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

export default function Login() {
  const handleWechatLogin = () => {
    Taro.showToast({
      title: '微信账号登录',
      icon: 'none',
    })
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
        <Button className='btn btn-disabled' disabled>
          本机号码快捷登录
        </Button>
        <Button className='btn btn-normal' onClick={handleWechatLogin}>
          微信账号登录
        </Button>
      </View>

      <View className='agreement'>
        <View className='agreement-title'>
          <Text>本人已阅读并同意以下条款</Text>
        </View>
        <View className='agreement-item'>
          <Checkbox />
          <Text>我同意《YEHEY平台个人及宠物信息收集声明》中所述与第三方共享信息</Text>
        </View>
        <View className='agreement-item'>
          <Checkbox />
          <Text>我已阅读关于七七七八八八九九九六六的《xxxxxx细则》</Text>
        </View>
      </View>

      <View className='register'>
        <Text>还没有账号？立即注册</Text>
      </View>
    </View>
  )
}
