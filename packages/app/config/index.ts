import path from 'node:path'
import os from 'node:os'
import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

function resolveLocalDevApiBaseUrl() {
  const networkInterfaces = os.networkInterfaces()

  for (const addresses of Object.values(networkInterfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue

      if (
        address.address.startsWith('192.168.') ||
        address.address.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(address.address)
      ) {
        return `http://${address.address}:9527`
      }
    }
  }

  return 'http://127.0.0.1:9527'
}

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig(async (merge, { command, mode }) => {
  const isWatchMode = process.argv.includes('--watch')
  const defaultApiBaseUrl =
    mode === 'development' || isWatchMode
      ? resolveLocalDevApiBaseUrl()
      : 'https://pet-wechat.yangl.com.cn'
  const apiBaseUrl =
    process.env.API_BASE_URL ||
    defaultApiBaseUrl

  const baseConfig: UserConfigExport = {
    projectName: 'pet-wechat-app',
    date: '2026-3-11',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [
      '@tarojs/plugin-framework-react',
      '@tarojs/plugin-sass',
    ],
    defineConstants: {
      API_BASE_URL: JSON.stringify(apiBaseUrl),
    },
    copy: {
      patterns: [],
      options: {},
    },
    sass: {
      resource: [
        path.resolve(__dirname, '..', 'src', 'styles', '_tokens.scss'),
        path.resolve(__dirname, '..', 'src', 'styles', '_mixins.scss'),
      ],
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false,
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      },
      commonChunks: ['runtime', 'vendors', 'taro', 'common'],
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js',
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false,
        },
      },
    },
  }
  if (mode === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
