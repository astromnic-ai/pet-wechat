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
## 设备与定制相关

### Q：定制宠物动态展示需要什么样的宠物照片？
A：为了达到最佳的动态效果，建议提供宠物姿态完整、光线明亮、形象清晰的原图。我们会根据您的宠物照片提取特征，定制专属于你的宠物形象表现，赋予其灵动的生命力。

### Q：设备可以展示多个宠物的动态吗？
A：支持。您可以通过小程序管理宠物与设备的绑定关系，随时切换展示多个宠物的动态表现。

### Q：设备需要插电还是充电使用？
A：桌面设备需要采用 USB-C 接口供电，保持设备电源通电，确保在您的书桌、床头等任何场景都能稳定陪伴。

## 定制与发货

### Q：定制流程是怎样的？大约多久？
A：您只需上传宠物高清照片，我们的团队将为您进行数字化动态建模与定制设计。由于定制过程涉及复杂的视觉处理，我们不提供售前样片预览。每一份动态展示都需要精细的数字建模与渲染，预计在您确认上传宠物形象后 [3-5] 个工作日内完成制作并同步在您的设备端。

## 售后与争议处理

### Q：收到实物后，对动态效果不满意怎么办？
A：我们深知每位家长对宝贝的理解都是独一无二的。如果您对呈现的动态效果有疑问，请通过小程序后台“联系客服”或“申请售后”，并详细说明您的修改建议。我们会第一时间为您提供针对性的解决方案。

### Q：屏幕或硬件出现故障怎么处理？
A：本产品自签收之日起享有 [一年] 的质保服务。若出现非人为损坏的黑屏、死机等问题，请联系客服寄回维修或更换。

### Q：定制产品可以退货吗？
A：由于本产品包含高度定制的数字化内容，用户下单即视为授权平台根据专业审美与技术标准进行创作，一旦进入定制生产环节，非硬件质量问题不支持退换货。如用户对实物效果存在异议，可通过官方售后渠道进行申诉协商。
    `.trim(),
    version: "local-fallback-2026-05-09",
    updatedAt: "2026-05-09T00:00:00.000Z",
  },
  about: {
    slug: "about",
    title: "关于 YEHEY",
    body: `
## YEHEY（耶嘿）

YEHEY 的诞生源于一份给猫猫的礼物，始于“我”与陪伴七年的猫猫平凡日常。不仅仅是一个品牌，它源于一个关于爱、快乐和陪伴的故事。

## 品牌理念：时刻陪伴，时刻雀跃

YEHEY 宠物桌面动态展示设备，是我们品牌理念的数字化延伸。我们深知，宠物对你而言不仅是生活的点缀，更是时刻活跃在心尖的牵挂。

打破空间的界限：我们尝试打破物理空间的厚重隔阂，通过数字动态技术让你无法陪伴在宠物身边时，感受到在忙碌与静谧的交替间，它为你筑起的一座微缩陪伴磁场。

捕捉灵动的瞬间：从家中满屋跑酷的活力，到怀里安然酣睡的宁静，我们通过动态定制技术，注重真实再现与情感共鸣，以生动的场景展现宠物生活的“存在”瞬间。

真实情感的共鸣：我们追求细腻且传神的表达，拒绝冰冷的工业模版。每一台定制设备，都承载着想要为心爱宠物带来优质生活的初心。我们希望在你的每一个生活细节里，都能感受到那份纯粹的情感流动。

## 产品愿景

陪伴不只发生在同一空间里，也可以在同一时间里真实发生。

我们致力于通过数字动态形象定制技术，建立独属于每只宠物真实的形象呈现。不仅仅是一台设备，更是连接主人与宠物真实的情感纽带。我们憧憬着这样一个未来：即使他们身处不同空间，也可以在同一时间感受到宠物陪伴，能感受到那份真实、灿烂且生动的幸福。
    `.trim(),
    version: "local-fallback-2026-05-09",
    updatedAt: "2026-05-09T00:00:00.000Z",
  },
  "user-agreement": {
    slug: "user-agreement",
    title: "用户协议",
    body: `
## 1. 服务说明
本服务为用户提供宠物数字相册及定制化桌面摆件显示功能，包括但不限于信息浏览、交互体验等。

## 2. 定制化商品特别条款
- 非七天无理由退货：鉴于桌面摆件属于私人定制商品，一旦用户确认设计稿并进入生产环节，非因质量问题（如破损、严重制作错误），不适用七天无理由退货规定。
- 素材授权：您上传宠物照片即表示您拥有该照片的版权或已获得合法授权。因照片版权引起的法律纠纷由用户自行承担。
- 制作偏差：用户理解并认可，因显示器色差、手工上色或材质特性，实物摆件与预览图可能存在细微差异，这不属于质量缺陷。

## 3. 用户行为规范
严禁上传包含暴力、色情、虐待动物或违反法律法规的照片。
不得利用小程序漏洞进行刷单或恶意攻击。

## 4. 知识产权声明
小程序的所有 UI 设计、品牌标识及摆件的原创设计模版归 YEHEY 所有。
用户对其上传的宠物照片保留原始著作权，但授予本平台在展示该用户个人相册及制作相应产品时所必须的许可使用权。

## 5. 免责声明
由于不可抗力、网络黑客攻击或系统维护导致的图片丢失、服务中断，平台将尽力恢复，但不承担由此产生的损失赔偿责任。建议用户自行备份珍贵照片。
    `.trim(),
    version: "local-fallback-2026-05-09",
    updatedAt: "2026-05-09T00:00:00.000Z",
  },
  privacy: {
    slug: "privacy",
    title: "隐私政策",
    body: `
## 信息收集
我们会收集您的设备信息、使用数据以及与宠物图片的活动记录，用于提供更好的服务体验。
设备权限：访问手机相册，获取相机权限，用于上传宠物照片制作摆件或保存相册。

## 信息使用
收集的信息仅用于改善产品功能、个性化推荐以及技术支持。我们不会将您的信息出售给第三方。

## 数据安全
我们采用行业标准的安全措施保护您的个人信息，包括数据加密和安全传输协议。

## 您的权利
您有权访问、更正或删除您的个人信息和宠物信息。如需行使这些权利，请通过设置页面联系我们。

## 联系我们
如对本隐私政策有任何疑问，请通过 support@yehey.com 与我们联系。
    `.trim(),
    version: "local-fallback-2026-05-09",
    updatedAt: "2026-05-09T00:00:00.000Z",
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

        {children}
      </View>
    </View>
  );
}
