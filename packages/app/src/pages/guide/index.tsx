import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { markGuideCompleted } from '../../utils/storage'
import PageBack from '../../components/PageBack'
import './index.scss'

type GuideMode = 'collar' | 'desktop'

export default function Guide() {
  const [selectedMode, setSelectedMode] = useState<GuideMode>('collar')

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

  const selectedCopy = useMemo(() => {
    if (selectedMode === 'collar') {
      return {
        title: '真实行为模式',
        desc: '优先连接宠物项圈，实时同步真实宠物行为，让桌面宠物更像真的陪伴在你身边。',
        features: ['实时反馈', '真实同步'],
      }
    }

    return {
      title: '桌面宠物模式',
      desc: '先配置桌面端设备，立即开启数字宠物体验。后续也可以再补充连接项圈，完善互动体验。',
      features: ['快速开始', '轻松体验'],
    }
  }, [selectedMode])

  const handleConfirm = () => {
    if (selectedMode === 'collar') {
      handleCollarSetup()
      return
    }

    handleDesktopSetup()
  }

  return (
    <View className='guide-page'>
      <PageBack />
      <View className='top-shell'>
        <Text className='brand'>YEHEY</Text>
      </View>

      <View className='header'>
        <Text className='header-title'>连接模式选择</Text>
      </View>

      <View className='selector-container'>
        <Text className='selector-title'>滑动选择模式</Text>

        <View className='mode-row'>
          <View
            className={`mode-card ${selectedMode === 'collar' ? 'active' : ''}`}
            onClick={() => setSelectedMode('collar')}
          >
            <View className='mode-icon-shell'>
              <Image
                src={require('@/assets/images/Group 1.png')}
                mode='aspectFit'
                className='mode-icon'
              />
            </View>
            <Text className='mode-label'>我有宠物陪伴</Text>
            <Text className='mode-desc'>项圈实时反馈</Text>
          </View>

          <View
            className={`mode-card ${selectedMode === 'desktop' ? 'active' : ''}`}
            onClick={() => setSelectedMode('desktop')}
          >
            <View className='mode-icon-shell'>
              <Image
                src={require('@/assets/images/snow-globe.png')}
                mode='aspectFit'
                className='mode-icon'
              />
            </View>
            <Text className='mode-label'>开启桌面宠物</Text>
            <Text className='mode-desc'>快速开始体验</Text>
          </View>
        </View>

        <View className='preview-panel'>
          <View className='preview-hero'>
            <Image
              src={selectedMode === 'collar' ? require('@/assets/images/Group 1.png') : require('@/assets/images/Group 2.png')}
              mode='aspectFit'
              className='preview-left'
            />
            <Image
              src={require('@/assets/images/wifi-icon.png')}
              mode='aspectFit'
              className='preview-link'
            />
            <Image
              src={selectedMode === 'collar' ? require('@/assets/images/mirror-icon.png') : require('@/assets/images/snow-globe.png')}
              mode='aspectFit'
              className='preview-right'
            />
          </View>

          <Text className='preview-title'>{selectedCopy.title}</Text>
          <Text className='preview-desc'>{selectedCopy.desc}</Text>

          <View className='feature-row'>
            {selectedCopy.features.map((item) => (
              <View key={item} className='feature-pill'>
                <Text className='feature-text'>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className='confirm-button' onClick={handleConfirm}>
          <Text className='confirm-text'>确认进入</Text>
          <Text className='confirm-arrow'>→</Text>
        </View>
      </View>

      <Text className='skip-link' onClick={handleSkip}>
        跳过，稍后再设置
      </Text>
    </View>
  )
}
