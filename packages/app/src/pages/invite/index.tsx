import { View, Text, Image, Button } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { request } from "../../utils/request";
import type { Pet } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import "./index.scss";

const DEFAULT_SHARE_MESSAGE = {
  title: "YEHEY",
  path: "/pages/index/index",
};

interface InviteInfo {
  petName: string;
  petSpecies: string;
  fromNickname: string;
  fromUserId: string;
  petId: string;
}

function calculateAge(birthday?: string | null): string {
  if (!birthday) return "年龄未知";

  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return "年龄未知";

  const today = new Date();
  if (birthDate.getTime() > today.getTime()) return "年龄未知";

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age >= 0 ? `${age}岁` : "年龄未知";
}

export default function Invite() {
  const router = useRouter();
  const code = typeof router.params.code === "string" ? router.params.code : "";
  const mode = router.params.mode ?? "invite";

  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [acceptDone, setAcceptDone] = useState(false);
  const [error, setError] = useState("");
  const canShareInvite = !code && mode !== "pair" && pet !== null && !error;

  useEffect(() => {
    setError("");

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
        setError("宠物信息加载失败");
      });
  }, [code]);

  const ageText = useMemo(() => {
    return `年龄：${calculateAge(pet?.birthday)}`;
  }, [pet?.birthday]);

  useEffect(() => {
    if (canShareInvite) {
      void Taro.showShareMenu({});
      return;
    }

    Taro.hideShareMenu();
  }, [canShareInvite]);

  useShareAppMessage(() => {
    if (!canShareInvite || pet === null) {
      return DEFAULT_SHARE_MESSAGE;
    }

    return new Promise((resolve) => {
      request<{
        inviteCode: string;
        petName: string;
        fromNickname: string;
      }>({
        url: "/api/devices/invite",
        method: "POST",
        data: { petId: pet.id },
      })
        .then((res) => {
          resolve({
            title: `${res.fromNickname}邀请你一起看${res.petName}`,
            path: `/pages/invite/index?code=${res.inviteCode}`,
          });
        })
        .catch(() => {
          Taro.showToast({ title: "生成邀请链接失败", icon: "none" });
          resolve(DEFAULT_SHARE_MESSAGE);
        });
    });
  });

  const handleGenerateInvite = () => {
    Taro.showToast({
      title: "一键连接中",
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
          <Text className="pet-tag">姓名：{pet?.name ?? "未知"}</Text>
          <Text className="pet-tag">品种：{pet?.breed || "未知"}</Text>
          <Text className="pet-tag">{ageText}</Text>
        </View>
      </View>

      {mode === "pair" ? (
        <View className="connect-button" onClick={handleGenerateInvite}>
          <Text className="connect-button-text">一键连接</Text>
        </View>
      ) : (
        <Button openType="share" className="connect-button" disabled={!canShareInvite}>
          <Text className="connect-button-text">一键连接</Text>
        </Button>
      )}

      <View className="guide-info-card">
        <Text className="guide-info-text">
          {error || "生成链接跳转到微信好友列表界面 选择并发送（类比分享）"}
        </Text>
      </View>
    </View>
  );
}
