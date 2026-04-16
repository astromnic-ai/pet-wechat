import { View, Text } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { useState, type ReactNode } from "react";
import type { ContentPage as ContentPageData, ContentSlug } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { parseMarkdown } from "../../utils/markdown";
import { request } from "../../utils/request";
import "./subpages.scss";

interface ContentPageProps {
  slug: ContentSlug;
  fallbackTitle: string;
  children?: ReactNode;
  hideContentBody?: boolean;
}

const LOCAL_CONTENT_FALLBACKS: Partial<Record<ContentSlug, ContentPageData>> = {
  help: {
    slug: "help",
    title: "帮助中心",
    body: `
## 常见问题
- 设备离线时，请先确认电量与网络状态。
- 互动次数为 0 时，表示当前还没有设备侧上报数据。

## 联系支持
如需人工协助，请通过官方客服渠道反馈设备型号、宠物昵称和问题现象。
    `.trim(),
    version: "local-fallback",
    updatedAt: "2026-04-15T00:00:00.000Z",
  },
  about: {
    slug: "about",
    title: "关于 YEHEY",
    body: `
YEHEY 专注于宠物陪伴设备与数字互动体验，帮助主人更安心地了解宠物状态。

## 服务说明
- 小程序用于查看设备状态、宠物互动数据和账号设置。
- 固件升级功能当前仅记录升级请求，后续将接入真实 OTA 通道。
    `.trim(),
    version: "local-fallback",
    updatedAt: "2026-04-15T00:00:00.000Z",
  },
  "user-agreement": {
    slug: "user-agreement",
    title: "用户协议",
    body: `
欢迎使用YEHEY！

## 1. 服务说明
本服务为用户提供宠物数字相册及定制化桌面摆件显示功能，包括但不限于信息浏览、交互体验等。

## 2. 定制化商品特别条款
·非七天无理由退货：鉴于桌面摆件属于私人定制商品，一旦用户确认设计稿并进入生产环节，非因质量问题（如破损、严重制作错误），不适用七天无理由退货规定。
·素材授权：您上传宠物照片即表示您拥有该照片的版权或已获得合法授权。因照片版权引起的法律纠纷由用户自行承担。
·制作偏差：用户理解并认可，因显示器色差、手工上色或材质特性，实物摆件与预览图可能存在细微差异，这不属于质量缺陷。

## 3. 用户行为规范
严禁上传包含暴力、色情、虐待动物或违反法律法规的照片。
不得利用小程序漏洞进行刷单或恶意攻击。

## 4. 知识产权声明
小程序的所有UI设计、品牌标识及摆件的原创设计模板归[公司/个人名称]所有。
用户对其上传的宠物照片保留原始著作权，但授予本平台在展示该用户个人相册及制作相应产品时所必须的许可使用权。

## 5. 免责声明
由于不可抗力、网络黑客攻击或系统维护导致的图片丢失、服务中断，平台将尽力恢复，但不承担由此产生的损失赔偿责任。建议用户自行备份珍贵照片。
    `.trim(),
    version: "local-fallback",
    updatedAt: "2026-04-15T00:00:00.000Z",
  },
  privacy: {
    slug: "privacy",
    title: "隐私政策",
    body: `
欢迎使用YEHEY！

## 信息收集
我们会收集您的设备信息、使用数据以及与宠物图片的活动记录，用于提供更好的服务体验。
设备权限：相册/相机权限：用于上传宠物照片制作摆件或保存相册。

## 信息使用
收集的信息仅用于改善产品功能、个性化推荐以及技术支持。我们不会将您的信息出售给第三方。

## 数据安全
我们采用行业标准的安全措施保护您的个人信息，包括数据加密和安全传输协议。

## 您的权利
您有权访问、更正或删除您的个人信息和宠物信息。如需行使这些权利，请通过设置页面联系我们。

## 联系我们
如对本隐私政策有任何疑问，请通过support@yehey.com与我们联系。
    `.trim(),
    version: "local-fallback",
    updatedAt: "2026-04-15T00:00:00.000Z",
  },
};

export default function ContentPage(props: ContentPageProps) {
  const { slug, fallbackTitle, children, hideContentBody = false } = props;
  const [content, setContent] = useState<ContentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadContent = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await request<ContentPageData>({ url: `/api/content/${slug}`, needAuth: false });
      setContent(result);
    } catch (requestError: any) {
      const fallback = LOCAL_CONTENT_FALLBACKS[slug];
      if (fallback) {
        setContent(fallback);
        setError("");
      } else {
        setError(requestError.message || "内容加载失败");
      }
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    void loadContent();
  });

  const resolvedContent = content ?? LOCAL_CONTENT_FALLBACKS[slug] ?? null;
  const blocks = parseMarkdown(resolvedContent?.body ?? "");

  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">{resolvedContent?.title || fallbackTitle}</Text>
      </View>

      <View className="settings-subpage-content">
        {children}

        {hideContentBody ? null : loading ? (
          <View className="content-card">
            <Text className="content-state-title">内容加载中</Text>
            <Text className="content-state-desc">正在同步最新文档，请稍候。</Text>
          </View>
        ) : error && !resolvedContent ? (
          <View className="content-card">
            <Text className="content-state-title">内容暂时不可用</Text>
            <Text className="content-state-desc">{error}</Text>
            <View
              className="content-retry-btn"
              onClick={() => {
                void loadContent();
              }}
            >
              <Text className="content-retry-btn-text">重试</Text>
            </View>
          </View>
        ) : (
          <View className="content-card">
            {blocks.map((block, index) => {
              if (block.type === "heading") {
                return (
                  <Text
                    key={`${block.type}-${index}`}
                    className={`markdown-heading markdown-heading--${block.level}`}
                  >
                    {block.text}
                  </Text>
                );
              }

              if (block.type === "quote") {
                return (
                  <View key={`${block.type}-${index}`} className="markdown-quote">
                    <Text className="markdown-quote-text">{block.text}</Text>
                  </View>
                );
              }

              if (block.type === "list") {
                return (
                  <View key={`${block.type}-${index}`} className="markdown-list">
                    {block.items.map((item, itemIndex) => (
                      <View key={`${item}-${itemIndex}`} className="markdown-list-item">
                        <Text className="markdown-list-marker">
                          {block.ordered ? `${itemIndex + 1}.` : "-"}
                        </Text>
                        <Text className="markdown-list-text">{item}</Text>
                      </View>
                    ))}
                  </View>
                );
              }

              return (
                <Text key={`${block.type}-${index}`} className="markdown-paragraph">
                  {block.text}
                </Text>
              );
            })}

            {resolvedContent ? (
              <View className="content-meta">
                <Text className="content-meta-text">版本：{resolvedContent.version.slice(0, 12)}</Text>
                <Text className="content-meta-text">更新：{resolvedContent.updatedAt.slice(0, 10)}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
