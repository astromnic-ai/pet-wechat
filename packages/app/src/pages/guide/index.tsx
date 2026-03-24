import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { markGuideCompleted } from '../../utils/storage'
import './index.scss'

export default function Guide() {
  const handleSkip = () => {
    markGuideCompleted()
    Taro.switchTab({ url: '/pages/index/index' })
  }

  const handleCollarSetup = () => {
    Taro.navigateTo({ url: '/pages/collar-bind/index' })
  }

  const handleDesktopSetup = () => {
    Taro.navigateTo({ url: '/pages/desktop-bind/index' })
  }

  return (
    <View className='guide-page'>
      <Text className='brand'>YEHEY</Text>

      <View className='module module-top' onClick={handleCollarSetup}>
        <View className='module-shell'>
          <View className='ellipse-card'>
            <View className='device-row'>
              <Image
                src={require('@/assets/images/Group 1.png')}
                mode='aspectFit'
                className='device-left'
              />
              <Image
                src={require('@/assets/images/wifi-icon.png')}
                mode='aspectFit'
                className='device-link'
              />
              <Image
                src={require('@/assets/images/mirror-icon.png')}
                mode='aspectFit'
                className='device-right'
              />
            </View>
            <Text className='device-desc'>优先配置项圈，同步宠物的真实行为</Text>
          </View>
        </View>

        <Text className='module-title'>我有宠物陪伴</Text>
      </View>

      <Text className='middle-text'>欢迎来到宠物新世界</Text>

      <View className='module module-bottom' onClick={handleDesktopSetup}>
        <Text className='module-title'>开启桌面宠物</Text>

        <View className='module-shell'>
          <View className='ellipse-card'>
            <View className='device-row'>
              <Image
                src={require('@/assets/images/Group 2.png')}
                mode='aspectFit'
                className='device-left'
              />
              <Image
                src={require('@/assets/images/wifi-icon.png')}
                mode='aspectFit'
                className='device-link'
              />
              <Image
                src={require('@/assets/images/snow-globe.png')}
                mode='aspectFit'
                className='device-right'
              />
            </View>
            <Text className='device-desc'>配置桌面端设备，开启数字宠物体验</Text>
          </View>
        </View>
      </View>

      <Text className='skip-link' onClick={handleSkip}>
        跳过，稍后再设置
      </Text>
    </View>
  )
}
