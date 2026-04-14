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
}

export default function ContentPage(props: ContentPageProps) {
  const { slug, fallbackTitle, children } = props;
  const [content, setContent] = useState<ContentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadContent = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await request<ContentPageData>({ url: `/api/content/${slug}` });
      setContent(result);
    } catch (requestError: any) {
      setError(requestError.message || "内容加载失败");
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    void loadContent();
  });

  const blocks = parseMarkdown(content?.body ?? "");

  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">{content?.title || fallbackTitle}</Text>
      </View>

      <View className="settings-subpage-content">
        {children}

        {loading ? (
          <View className="content-card">
            <Text className="content-state-title">内容加载中</Text>
            <Text className="content-state-desc">正在同步最新文档，请稍候。</Text>
          </View>
        ) : error ? (
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

            {content ? (
              <View className="content-meta">
                <Text className="content-meta-text">版本：{content.version.slice(0, 12)}</Text>
                <Text className="content-meta-text">更新：{content.updatedAt.slice(0, 10)}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
