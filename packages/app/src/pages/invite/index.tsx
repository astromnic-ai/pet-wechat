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

function getDisplayName(value?: string | null, fallback = "邀请人") {
  const trimmed = value?.trim() || "";
  if (!trimmed || trimmed === "微信用户" || trimmed === "开发用户" || /^用户\d{4}$/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
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
  const petId = typeof router.params.petId === "string" ? router.params.petId : "";
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

    request<{ pets: Pet[]; authorizedPets?: Pet[] }>({ url: "/api/pets" })
      .then((res) => {
        const mergedPets = [...res.pets, ...(res.authorizedPets || [])];
        if (petId) {
          const matchedPet = mergedPets.find((item) => item.id === petId) || null;
          setPet(matchedPet);
          return;
        }
        if (mergedPets.length > 0) {
          setPet(mergedPets[0]);
        }
      })
      .catch(() => {
        setError("宠物信息加载失败");
      });
  }, [code, petId]);

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
    const acceptState = error ? "error" : acceptDone ? "success" : "pending";
    const acceptIcon =
      acceptState === "success"
        ? require("@/assets/images/success-icon.png")
        : acceptState === "error"
          ? require("@/assets/images/fail-icon.png")
          : require("@/assets/images/bell-icon.png");

    return (
      <View className="invite-accept-page">
        <View className="invite-top-strip" />
        <View className="invite-header">
          <PageBack inline />
          <Text className="invite-title">接受授权</Text>
        </View>
        <View className="accept-card">
          <View className={`accept-badge accept-badge--${acceptState}`}>
            <Image className="accept-badge-icon" src={acceptIcon} mode="aspectFit" />
          </View>
          <Text className="accept-title">
            {acceptDone ? "授权成功" : error ? "邀请异常" : "宠物绑定邀请"}
          </Text>
          <Text className="accept-desc">
            {error
              ? error
              : acceptDone
                ? `你已获得查看 ${inviteInfo?.petName ?? "该宠物"} 的权限`
                : `${getDisplayName(inviteInfo?.fromNickname)} 邀请你加入宠物桌面`}
          </Text>
          {!error ? (
            <View className="accept-info-card">
              <Text className="accept-info-label">宠物名称</Text>
              <Text className="accept-info-value">{inviteInfo?.petName?.trim() || "未命名宠物"}</Text>
              <Text className="accept-info-label">邀请人</Text>
              <Text className="accept-info-value">{getDisplayName(inviteInfo?.fromNickname)}</Text>
            </View>
          ) : null}
          <View className="accept-button" onClick={acceptDone || error ? handleGoHome : handleAccept}>
            <Text className="accept-button-text">
              {acceptDone || error ? "进入主页" : loading ? "处理中..." : "接受邀请"}
            </Text>
          </View>
          <Text className="accept-footnote">
            {acceptDone || error
              ? "返回主页后，你可以在设备管理和主页中查看最新授权状态"
              : "接受授权后，你将可以查看该宠物的相关设备和展示信息"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="invite-share-page">
      <View className="invite-top-strip" />
      <View className="invite-header">
        <PageBack inline />
        <Text className="invite-title">分享授权</Text>
      </View>

      <View className="invite-share-shell">
        <View className="pet-info-card">
          <View className="pet-avatar-wrap">
            <Image
              className="pet-avatar"
              src={pet?.avatarImageUrl || (pet?.species === "dog" ? require("@/assets/images/husky.png") : require("@/assets/images/black cat 3.png"))}
              mode="aspectFit"
            />
          </View>
          <View className="pet-info-main">
            <Text className="pet-info-title">{pet?.name?.trim() || "未选择宠物"}</Text>
            <Text className="pet-info-subtitle">{pet?.breed?.trim() || "待完善宠物资料"}</Text>
            <Text className="pet-info-subtitle">{ageText}</Text>
          </View>
        </View>

        <View className="share-guide-card">
          <Text className="share-guide-title">授权说明</Text>
          <Text className="share-guide-text">
            {error || "点击下方按钮后，将打开微信原生分享面板。选择好友后，对方即可收到当前宠物的查看授权邀请。"}
          </Text>
        </View>

        {mode === "pair" ? (
          <View className="connect-button" onClick={handleGenerateInvite}>
            <Text className="connect-button-text">发送给微信好友</Text>
          </View>
        ) : (
          <Button openType="share" className="connect-button" disabled={!canShareInvite}>
            <Text className="connect-button-text">发送给微信好友</Text>
          </Button>
        )}

        <Text className="share-footnote">分享弹层为微信原生界面，外观不可自定义</Text>
      </View>
    </View>
  );
}
