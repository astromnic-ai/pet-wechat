import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { request } from "../../utils/request";
import type { Pet } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import "./index.scss";

interface InviteInfo {
  petName: string;
  petSpecies: string;
  fromNickname: string;
  fromUserId: string;
  petId: string;
}

const FALLBACK_PET: Pet = {
  id: "mock-pet-001",
  userId: "mock-user",
  name: "小黑",
  species: "cat",
  breed: "英短",
  gender: "unknown",
  birthday: "2023-01-01",
  weight: 4,
  activityScore: 88,
  latestBehavior: null,
  avatarImageUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function Invite() {
  const router = useRouter();
  const code = router.params.code;
  const mode = router.params.mode ?? "invite";

  const [pet, setPet] = useState<Pet>(FALLBACK_PET);
  const [loading, setLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [acceptDone, setAcceptDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (code) {
      request<InviteInfo>({ url: `/api/invite/${code}`, needAuth: false })
        .then(setInviteInfo)
        .catch(() => setError("邀请链接无效或已过期"));
      return;
    }

    request<{ pets: Pet[] }>({ url: "/api/pets" })
      .then((res) => {
        if (res.pets.length > 0) {
          setPet(res.pets[0]);
        }
      })
      .catch(() => {
        setPet(FALLBACK_PET);
      });
  }, [code]);

  const ageText = useMemo(() => {
    if (!pet.birthday) return "年龄：2岁";
    return `年龄：${new Date().getFullYear() - new Date(pet.birthday).getFullYear()}岁`;
  }, [pet.birthday]);

  const handleGenerateInvite = () => {
    Taro.showToast({
      title: mode === "pair" ? "一键连接中" : "已生成分享链接",
      icon: "none",
    });
  };

  const handleAccept = async () => {
    if (!code || loading) return;
    setLoading(true);
    try {
      await request({
        url: `/api/devices/invite/${code}/accept`,
        method: "POST",
      });
      setAcceptDone(true);
    } catch (e: any) {
      setError(e.message || "接受邀请失败");
    } finally {
      setLoading(false);
    }
  };

  const handleGoHome = () => {
    Taro.switchTab({ url: "/pages/index/index" });
  };

  if (code) {
    return (
      <View className="invite-accept-page">
        <PageBack />
        <View className="accept-card">
          <Text className="accept-title">
            {acceptDone ? "授权成功" : error ? "邀请异常" : "宠物绑定邀请"}
          </Text>
          <Text className="accept-desc">
            {error
              ? error
              : acceptDone
                ? `你已获得查看 ${inviteInfo?.petName ?? "该宠物"} 的权限`
                : `${inviteInfo?.fromNickname ?? "家人"} 邀请你加入宠物桌面`}
          </Text>
          <View className="accept-button" onClick={acceptDone || error ? handleGoHome : handleAccept}>
            <Text className="accept-button-text">
              {acceptDone || error ? "进入主页" : loading ? "处理中..." : "接受邀请"}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="invite-share-page">
      <PageBack />
      <View className="pet-info-card">
        <Image
          className="pet-avatar"
          src={require("@/assets/images/black-cat.png")}
          mode="aspectFit"
        />
        <View className="pet-tags">
          <Text className="pet-tag">姓名：{pet.name}</Text>
          <Text className="pet-tag">品种：{pet.breed || "英短"}</Text>
          <Text className="pet-tag">{ageText}</Text>
        </View>
      </View>

      <View className="connect-button" onClick={handleGenerateInvite}>
        <Text className="connect-button-text">一键连接</Text>
      </View>

      <View className="guide-info-card">
        <Text className="guide-info-text">
          生成链接跳转到微信好友列表界面 选择并发送（类比分享）
        </Text>
      </View>
    </View>
  );
}
