import { View, Text, Image, Input, Video } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import { addPetCustomActionLabel } from "../../utils/storage";
import "./index.scss";

export default function CustomAction() {
  const router = useRouter();
  const petId = router.params.petId || "";
  const [videoPath, setVideoPath] = useState("");
  const [actionName, setActionName] = useState("");
  const [actionDesc, setActionDesc] = useState("");
  const canSubmit = videoPath.length > 0 && actionName.trim().length > 0;

  const handleChooseVideo = async () => {
    try {
      const res = await Taro.chooseVideo({
        sourceType: ["album", "camera"],
        compressed: true,
        maxDuration: 30,
      });
      setVideoPath(res.tempFilePath);
    } catch {}
  };

  const handleSubmit = () => {
    if (!videoPath) {
      Taro.showToast({ title: "请先上传视频", icon: "none" });
      return;
    }

    if (!canSubmit) {
      Taro.showToast({ title: "请输入动作名称", icon: "none" });
      return;
    }

    addPetCustomActionLabel(petId, actionName);

    const query = [
      "status=done",
      "source=custom-action",
      petId ? `petId=${encodeURIComponent(petId)}` : "",
      actionName ? `label=${encodeURIComponent(actionName)}` : "",
    ]
      .filter(Boolean)
      .join("&");

    Taro.redirectTo({ url: `/pages/avatar-progress/index?${query}` });
  };

  return (
    <View className="custom-action-page">
      <View className="custom-action-top-strip" />
      <View className="custom-action-header">
        <PageBack inline />
        <Text className="custom-action-title">添加自定义动作</Text>
      </View>

      <View className="custom-action-card">
        <View className="video-upload-box" onClick={handleChooseVideo}>
          {videoPath ? (
            <Video
              className="video-upload-preview"
              src={videoPath}
              controls
              showCenterPlayBtn
              objectFit="cover"
            />
          ) : (
            <View className="video-upload-placeholder">
              <Image className="video-upload-icon" src={require("@/assets/images/upload-icon.png")} mode="aspectFit" />
            </View>
          )}
          <Text className="video-upload-text">{videoPath ? "已选择视频" : "点击上传视频"}</Text>
          <Text className="video-upload-subtext">{videoPath ? "点击视频区域可重新选择" : "视频时长不超过30秒"}</Text>
        </View>

        <View className="custom-tips">
          <View className="custom-tip-item">
            <View className="custom-tip-check custom-tip-check--blue">✓</View>
            <Text className="custom-tip-text">确保宠物全身都在画面中</Text>
          </View>
          <View className="custom-tip-item">
            <View className="custom-tip-check custom-tip-check--yellow">✓</View>
            <Text className="custom-tip-text">光线充足，背景简洁</Text>
          </View>
          <View className="custom-tip-item">
            <View className="custom-tip-check custom-tip-check--pink">✓</View>
            <Text className="custom-tip-text">动作持续3-10秒最佳</Text>
          </View>
        </View>

        <View className="custom-field">
          <Text className="custom-field-label">动作名称 *</Text>
          <Input
            className="custom-field-input"
            value={actionName}
            placeholder="请输入动作名称"
            onInput={(e) => setActionName(e.detail.value)}
          />
        </View>

        <View className="custom-field">
          <Text className="custom-field-label">动作描述</Text>
          <Input
            className="custom-field-input"
            value={actionDesc}
            placeholder="简要描述自定义动作"
            onInput={(e) => setActionDesc(e.detail.value)}
          />
        </View>

        <View className={`custom-submit-btn ${canSubmit ? "" : "custom-submit-btn--disabled"}`} onClick={handleSubmit}>
          <Text className="custom-submit-btn-text">开始定制</Text>
        </View>
      </View>
    </View>
  );
}
