import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  SaveOutlined,
  SyncOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Image,
  Input,
  Modal,
  Progress,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ACTION_LABELS,
  ALL_ACTIONS,
  BASIC_ACTIONS,
  FUN_ACTIONS,
  INTERACTIVE_ACTIONS,
  type ActionType,
  type CustomizationTask,
  type Gender,
  type Pet,
  type PetAvatar,
  type PetAvatarAction,
  type Species,
  type User,
} from "shared";
import dayjs from "dayjs";
import { api } from "../api/client";

const { Text, Title } = Typography;
const CUSTOMIZATION_VIDEO_ACCEPT = ".mjpeg,.mjpg,video/mjpeg,video/x-motion-jpeg";
const HOMEPAGE_IMAGE_ACCEPT = ".png,image/png";

type CustomizationStatus = "approved" | "processing" | "done";
type TaskTab = "pending" | "done";
type TaskCategoryFilter = "all" | "system" | "personalized";
type ActionCategoryFilter = "basic" | "fun" | "interactive";

type CustomizationAvatar = PetAvatar & {
  pet:
    | (Pick<Pet, "id" | "name" | "species" | "breed" | "gender" | "birthday"> & {
        species: Species | "other" | string | null;
      })
    | null;
  user: Pick<User, "id" | "nickname" | "avatarUrl" | "wechatOpenid" | "phone"> | null;
  task?: CustomizationTask | null;
};

type CustomizationAvatarDetail = CustomizationAvatar & {
  actions: PetAvatarAction[];
};

type CustomizationAction = PetAvatarAction & {
  actionType: ActionType;
};

type CategoryProgress = {
  completed: number;
  total: number;
};

type UploadContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "video/mp4"
  | "video/mjpeg"
  | "video/x-motion-jpeg";

const TASK_STATUSES: CustomizationStatus[] = ["approved", "processing", "done"];

const categoryOptions = [
  { label: "全部", value: "all" },
  { label: "系统定制", value: "system" },
  { label: "个性化定制", value: "personalized" },
] satisfies { label: string; value: TaskCategoryFilter }[];

const statusMeta: Record<CustomizationStatus, { label: string; color: string }> = {
  approved: { label: "待定制", color: "blue" },
  processing: { label: "进行中", color: "orange" },
  done: { label: "已完成", color: "green" },
};

const speciesLabels: Record<string, string> = {
  cat: "猫",
  dog: "狗",
  other: "其他",
};

const genderLabels: Record<Gender, string> = {
  male: "公",
  female: "母",
  unknown: "未知",
};

const actionCategoryLabels: Record<ActionCategoryFilter, string> = {
  basic: "基础动作",
  fun: "趣味动作",
  interactive: "交互动作",
};

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function toShanghaiDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const shifted = new Date(date.getTime() + shanghaiOffsetMs);
  return `${shifted.getUTCFullYear()}-${padNumber(shifted.getUTCMonth() + 1)}-${padNumber(shifted.getUTCDate())}`;
}

function isTodayInShanghai(value?: string | null) {
  if (!value) {
    return false;
  }

  return toShanghaiDayKey(value) === toShanghaiDayKey(new Date());
}

function enteredCustomizationToday(avatar: CustomizationAvatar) {
  if (!TASK_STATUSES.includes(avatar.status as CustomizationStatus)) {
    return false;
  }

  return isTodayInShanghai(avatar.reviewedAt);
}

function getSpeciesLabel(species?: string | null) {
  if (!species) {
    return "未知";
  }

  return speciesLabels[species] ?? species;
}

function getGenderLabel(gender?: string | null) {
  if (!gender) {
    return "未知";
  }

  return genderLabels[gender as Gender] ?? "未知";
}

function getAgeLabel(birthday?: string | null) {
  if (!birthday) {
    return "未知";
  }

  const birth = dayjs(birthday);
  if (!birth.isValid() || birth.isAfter(dayjs())) {
    return "未知";
  }

  const months = dayjs().diff(birth, "month");
  if (months < 12) {
    return `${Math.max(1, months)}个月`;
  }

  const years = dayjs().diff(birth, "year");
  return `${years}岁`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "-";
}

function getFileExtension(filename?: string | null) {
  const normalized = filename?.trim().toLowerCase() ?? "";
  const segments = normalized.split(".");
  return segments.length > 1 ? segments[segments.length - 1] ?? "" : "";
}

function isMjpegFile(file: File) {
  const ext = getFileExtension(file.name);
  const allowedTypes = new Set(["video/mjpeg", "video/x-motion-jpeg", "application/octet-stream", ""]);
  return (ext === "mjpeg" || ext === "mjpg") && allowedTypes.has(file.type);
}

function resolveMjpegContentType(file: File): UploadContentType {
  if (file.type === "video/mjpeg" || file.type === "video/x-motion-jpeg") {
    return file.type;
  }

  return "video/x-motion-jpeg";
}

function isHomepageImageFile(file: File) {
  const ext = getFileExtension(file.name);
  const allowedTypes = new Set(["image/png", "application/octet-stream", ""]);
  return ext === "png" && allowedTypes.has(file.type);
}

function isPngUrl(url?: string | null) {
  if (!url) {
    return false;
  }

  return /\.png(?:$|[?#])/i.test(url);
}

function isVideoUrl(url?: string | null) {
  if (!url) {
    return false;
  }

  return /\.(mp4|mjpeg|mjpg)(?:$|[?#])/i.test(url);
}

function shouldPreviewAsVideo(mode: "action" | "homepage", file: File | null, previewUrl: string) {
  if (mode === "action") {
    return (file ? isMjpegFile(file) : false) || isVideoUrl(previewUrl);
  }

  return false;
}

function parseAdditionalImages(rawValue?: string | null) {
  if (!rawValue) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];
  } catch {
    return [];
  }
}

function hasAdditionalReferences(rawValue?: string | null) {
  return parseAdditionalImages(rawValue).length > 0;
}

function buildActionMap(actions: PetAvatarAction[]) {
  return actions.reduce<Record<string, CustomizationAction>>((map, action) => {
    map[action.actionType] = action as CustomizationAction;
    return map;
  }, {});
}

function countCompletedActions(actions: PetAvatarAction[], actionTypes: readonly ActionType[]) {
  const actionTypeSet = new Set(actionTypes);
  const completedActionTypes = new Set(
    actions
      .map((action) => action.actionType as ActionType)
      .filter((actionType) => actionTypeSet.has(actionType)),
  );

  return completedActionTypes.size;
}

function getCategoryProgress(actions: PetAvatarAction[], category: ActionCategoryFilter | "all"): CategoryProgress {
  if (category === "basic") {
    return {
      completed: countCompletedActions(actions, BASIC_ACTIONS),
      total: BASIC_ACTIONS.length,
    };
  }

  if (category === "fun") {
    return {
      completed: countCompletedActions(actions, FUN_ACTIONS),
      total: FUN_ACTIONS.length,
    };
  }

  if (category === "interactive") {
    return {
      completed: countCompletedActions(actions, INTERACTIVE_ACTIONS),
      total: INTERACTIVE_ACTIONS.length,
    };
  }

  return {
    completed: countCompletedActions(actions, ALL_ACTIONS),
    total: ALL_ACTIONS.length,
  };
}

function getCategoryStatusTag(progress: CategoryProgress) {
  if (progress.completed === 0) {
    return { label: "待定制", color: "blue" };
  }

  if (progress.completed >= progress.total) {
    return { label: "已完成", color: "green" };
  }

  return { label: "进行中", color: "orange" };
}

function getStatusMetaForAvatarStatus(status: CustomizationStatus) {
  return statusMeta[status];
}

function getDefaultPreviewActionType(actions: PetAvatarAction[]) {
  if (actions.length === 0) {
    return null;
  }

  return actions[0].actionType as ActionType;
}

async function downloadImage(imageUrl: string, fallbackName: string) {
  const response = await fetch(imageUrl, { mode: "cors" });

  if (!response.ok) {
    throw new Error("图片下载失败");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function toCustomizationTaskSummary(avatar: CustomizationAvatarDetail): CustomizationTask {
  const baseActionCount = countCompletedActions(avatar.actions, BASIC_ACTIONS);
  const funActionCount = countCompletedActions(avatar.actions, FUN_ACTIONS);
  const interactiveActionCount = countCompletedActions(avatar.actions, INTERACTIVE_ACTIONS);
  const personalizedActionCount = funActionCount + interactiveActionCount;
  const totalActionCount = new Set(avatar.actions.map((action) => action.actionType)).size;
  const supportsPersonalizedActions = hasAdditionalReferences(avatar.additionalImageUrls);

  return {
    avatarId: avatar.id,
    petId: avatar.petId,
    petName: avatar.pet?.name ?? "未命名宠物",
    petSpecies: (avatar.pet?.species === "dog" ? "dog" : "cat") as Species,
    petBreed: avatar.pet?.breed ?? null,
    petGender: avatar.pet?.gender ?? "unknown",
    petBirthday: avatar.pet?.birthday ?? null,
    userId: avatar.user?.id ?? "",
    userNickname: avatar.user?.nickname ?? "未知微信用户",
    userAvatarUrl: avatar.user?.avatarUrl ?? null,
    userPhone: avatar.user?.phone ?? null,
    status: avatar.status,
    defaultPreviewUrl: avatar.actions[0]?.imageUrl ?? avatar.sourceImageUrl,
    baseActionCount,
    funActionCount,
    interactiveActionCount,
    personalizedActionCount,
    totalActionCount,
    baseActionTotal: BASIC_ACTIONS.length,
    funActionTotal: FUN_ACTIONS.length,
    interactiveActionTotal: INTERACTIVE_ACTIONS.length,
    personalizedActionTotal: FUN_ACTIONS.length + INTERACTIVE_ACTIONS.length,
    supportsFunActions: supportsPersonalizedActions,
    supportsInteractiveActions: supportsPersonalizedActions,
    categoryStatus:
      totalActionCount === 0
        ? "empty"
        : totalActionCount >= BASIC_ACTIONS.length + FUN_ACTIONS.length + INTERACTIVE_ACTIONS.length
          ? "all_done"
          : baseActionCount > 0
            ? "base_done"
            : "partial",
    isNewToday: enteredCustomizationToday(avatar),
    createdAt: avatar.createdAt,
    reviewedAt: avatar.reviewedAt ?? null,
  };
}

function mergeTasksWithAvatarSummaries(
  tasks: CustomizationTask[],
  avatarSummaries: CustomizationAvatar[],
): CustomizationAvatar[] {
  const avatarMap = new Map(avatarSummaries.map((avatar) => [avatar.id, avatar]));

  return tasks.map((task) => {
    const avatar = avatarMap.get(task.avatarId);
    return {
      id: task.avatarId,
      petId: task.petId,
      sourceImageUrl: avatar?.sourceImageUrl ?? task.defaultPreviewUrl ?? "",
      status: task.status,
      rejectReason: avatar?.rejectReason ?? null,
      reviewedAt: task.reviewedAt ?? avatar?.reviewedAt ?? null,
      createdAt: task.createdAt,
      pet:
        avatar?.pet ??
        ({
          id: task.petId,
          name: task.petName,
          species: task.petSpecies,
          breed: task.petBreed,
          gender: task.petGender,
          birthday: task.petBirthday,
        } satisfies CustomizationAvatar["pet"]),
      user:
        avatar?.user ??
        {
          id: task.userId,
          nickname: task.userNickname,
          avatarUrl: task.userAvatarUrl,
          wechatOpenid: null,
          phone: task.userPhone,
        },
      task,
    };
  });
}

function getTaskProgress(task: CustomizationTask | null | undefined, category: ActionCategoryFilter | "all"): CategoryProgress | null {
  if (!task) {
    return null;
  }

  if (category === "basic") {
    return {
      completed: task.baseActionCount,
      total: task.baseActionTotal,
    };
  }

  if (category === "fun") {
    return {
      completed: task.funActionCount,
      total: task.funActionTotal,
    };
  }

  if (category === "interactive") {
    return {
      completed: task.interactiveActionCount,
      total: task.interactiveActionTotal,
    };
  }

  return {
    completed: task.totalActionCount,
    total: task.baseActionTotal + task.funActionTotal + task.interactiveActionTotal,
  };
}

function hasPersonalizedTask(avatar: CustomizationAvatar) {
  return (
    avatar.task?.supportsFunActions ??
    avatar.task?.supportsInteractiveActions ??
    hasAdditionalReferences(avatar.additionalImageUrls)
  );
}

function toCustomizationAvatarSummary(avatar: CustomizationAvatarDetail): CustomizationAvatar {
  const { actions: _actions, ...summary } = avatar;
  return {
    ...summary,
    task: toCustomizationTaskSummary(avatar),
  };
}

export default function Customization() {
  const [messageApi, contextHolder] = message.useMessage();
  const [avatars, setAvatars] = useState<CustomizationAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [todayNewPendingCount, setTodayNewPendingCount] = useState(0);
  const [taskTab, setTaskTab] = useState<TaskTab>("pending");
  const [categoryFilter, setCategoryFilter] = useState<TaskCategoryFilter>("all");
  const [actionFilter, setActionFilter] = useState<ActionCategoryFilter>("basic");
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedAvatarDetail, setSelectedAvatarDetail] = useState<CustomizationAvatarDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewActionType, setPreviewActionType] = useState<ActionType | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<"action" | "homepage">("action");
  const [uploadActionType, setUploadActionType] = useState<ActionType | null>(null);
  const [uploadImageUrl, setUploadImageUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState("");
  const [petDescriptionDraft, setPetDescriptionDraft] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null);
  const [metaSaving, setMetaSaving] = useState(false);
  const [savingActionCategory, setSavingActionCategory] = useState<ActionCategoryFilter | null>(null);
  const [syncing, setSyncing] = useState(false);
  const detailRequestRef = useRef(0);

  const loadAvatars = async () => {
    setLoading(true);

    try {
      const [tasksResponse, pendingBadgeResponse, avatarResponse] = await Promise.all([
        api.getCustomizationTasks({
          page: "1",
          pageSize: "100",
          status: "approved,processing,done",
          category: "all",
        }),
        api.getCustomizationTasks({
          page: "1",
          pageSize: "100",
          status: "approved,processing",
          category: "all",
        }),
        api.getAvatars(),
      ]);

      const nextAvatarSummaries = ((avatarResponse.avatars as CustomizationAvatar[]) ?? []).filter((avatar) =>
        TASK_STATUSES.includes(avatar.status as CustomizationStatus),
      );
      const nextAvatars = mergeTasksWithAvatarSummaries(tasksResponse.items ?? [], nextAvatarSummaries);
      const pendingTasks = pendingBadgeResponse.items ?? [];
      setAvatars(nextAvatars);
      setTodayNewPendingCount(pendingTasks.filter((task) => task.isNewToday).length);
    } catch (error) {
      setAvatars([]);
      setTodayNewPendingCount(0);
      messageApi.error(error instanceof Error ? error.message : "定制任务加载失败");
    } finally {
      setLoading(false);
    }
  };

  const loadAvatarDetail = async (avatarId: string, options?: { keepLoading?: boolean }) => {
    const requestId = ++detailRequestRef.current;

    if (!options?.keepLoading) {
      setDetailLoading(true);
    }

    try {
      const response = await api.getAvatar(avatarId);
      const detail = response.avatar as CustomizationAvatarDetail;

      if (detailRequestRef.current === requestId) {
        setSelectedAvatarDetail(detail);
        setPetDescriptionDraft(detail.petDescription?.trim() ?? "");
        setPreviewActionType((current) => {
          if (current && detail.actions.some((action) => action.actionType === current)) {
            return current;
          }

          return getDefaultPreviewActionType(detail.actions);
        });
      }

      return detail;
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setSelectedAvatarDetail(null);
        setPetDescriptionDraft("");
        setPreviewActionType(null);
      }

      messageApi.error(error instanceof Error ? error.message : "定制详情加载失败");
      return null;
    } finally {
      if (!options?.keepLoading && detailRequestRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    if (uploadImageUrl.trim()) {
      setUploadPreviewUrl(uploadImageUrl.trim());
      return;
    }

    if (!uploadFile) {
      setUploadPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(uploadFile);
    setUploadPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [uploadFile, uploadImageUrl]);

  useEffect(() => {
    void loadAvatars();
  }, []);

  const tabAvatars = useMemo(
    () =>
      avatars.filter((avatar) =>
        taskTab === "pending" ? avatar.status === "approved" || avatar.status === "processing" : avatar.status === "done",
      ),
    [avatars, taskTab],
  );

  const filteredAvatars = useMemo(
    () =>
      tabAvatars.filter((avatar) => {
        if (categoryFilter === "all") {
          return true;
        }

        if (categoryFilter === "system") {
          return !hasPersonalizedTask(avatar);
        }

        return hasPersonalizedTask(avatar);
      }),
    [categoryFilter, tabAvatars],
  );

  useEffect(() => {
    if (filteredAvatars.length === 0) {
      setSelectedAvatarId(null);
      setSelectedAvatarDetail(null);
      setPetDescriptionDraft("");
      setPreviewActionType(null);
      return;
    }

    if (!selectedAvatarId || !filteredAvatars.some((avatar) => avatar.id === selectedAvatarId)) {
      setSelectedAvatarId(filteredAvatars[0].id);
    }
  }, [filteredAvatars, selectedAvatarId]);

  useEffect(() => {
    if (!selectedAvatarId) {
      setSelectedAvatarDetail(null);
      setPreviewActionType(null);
      return;
    }

    void loadAvatarDetail(selectedAvatarId);
  }, [selectedAvatarId]);

  const selectedAvatarSummary = useMemo(
    () => avatars.find((avatar) => avatar.id === selectedAvatarId) ?? null,
    [avatars, selectedAvatarId],
  );
  const selectedPetDescription = (selectedAvatarDetail?.petDescription ?? selectedAvatarSummary?.petDescription ?? "").trim();

  const actionMap = useMemo(
    () => buildActionMap(selectedAvatarDetail?.actions ?? []),
    [selectedAvatarDetail?.actions],
  );

  const selectedActions = selectedAvatarDetail?.actions ?? [];
  const totalActionCount =
    BASIC_ACTIONS.length + FUN_ACTIONS.length + INTERACTIVE_ACTIONS.length;
  const uploadedProgress = getCategoryProgress(selectedActions, "all");
  const clampedUploadedCompleted = Math.min(uploadedProgress.completed, totalActionCount);
  const uploadedProgressPercent = totalActionCount > 0 ? Math.round((clampedUploadedCompleted / totalActionCount) * 100) : 0;
  const basicProgress = getCategoryProgress(selectedActions, "basic");
  const funProgress = getCategoryProgress(selectedActions, "fun");
  const interactiveProgress = getCategoryProgress(selectedActions, "interactive");
  const canEditActions = selectedAvatarDetail?.status === "approved" || selectedAvatarDetail?.status === "processing";
  const canEditHomepageImage =
    selectedAvatarDetail?.status === "approved" ||
    selectedAvatarDetail?.status === "processing" ||
    selectedAvatarDetail?.status === "done";
  const canReplaceCompletedActions = selectedAvatarDetail?.status === "done";
  const canSync =
    !!selectedAvatarDetail &&
    uploadedProgress.completed >= totalActionCount &&
    selectedAvatarDetail.status !== "done";

  const previewAction = previewActionType ? actionMap[previewActionType] : undefined;
  const homepageImageUrl = selectedAvatarDetail?.homepageImageUrl ?? selectedAvatarSummary?.homepageImageUrl ?? "";
  const selectedAvatarImage =
    selectedAvatarDetail?.sourceImageUrl ?? selectedAvatarSummary?.sourceImageUrl ?? "";
  const referenceImages = parseAdditionalImages(
    selectedAvatarDetail?.additionalImageUrls ?? selectedAvatarSummary?.additionalImageUrls,
  );
  const selectedAvatarFilePrefix = selectedAvatarSummary?.id ?? selectedAvatarId ?? "avatar";

  const refreshCurrentAvatar = async (avatarId: string) => {
    await Promise.all([loadAvatars(), loadAvatarDetail(avatarId, { keepLoading: true })]);
  };

  const handleSavePetDescription = async () => {
    if (!selectedAvatarDetail) {
      return;
    }

    setMetaSaving(true);
    try {
      await api.updateAvatarMeta(selectedAvatarDetail.id, {
        petDescription: petDescriptionDraft.trim(),
      });
      messageApi.success("宠物描述已保存");
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "宠物描述保存失败");
    } finally {
      setMetaSaving(false);
    }
  };

  const handleOpenActionUploadModal = (actionType: ActionType) => {
    setUploadMode("action");
    setUploadActionType(actionType);
    setUploadImageUrl(actionMap[actionType]?.videoUrl || actionMap[actionType]?.imageUrl || "");
    setUploadFile(null);
    setUploadModalOpen(true);
  };

  const handleOpenHomepageUploadModal = () => {
    setUploadMode("homepage");
    setUploadActionType(null);
    setUploadImageUrl(homepageImageUrl);
    setUploadFile(null);
    setUploadModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    setUploadModalOpen(false);
    setUploadActionType(null);
    setUploadMode("action");
    setUploadImageUrl("");
    setUploadFile(null);
    setUploadPreviewUrl("");
  };

  const handleSubmitHomepageImage = async () => {
    if (!selectedAvatarDetail) {
      return;
    }

    setSubmittingAction(true);

    try {
      let homepageImage = uploadImageUrl.trim();

      if (uploadFile) {
        if (!isHomepageImageFile(uploadFile)) {
          messageApi.warning("仅支持 PNG 图片文件");
          return;
        }

        const uploadResult = await api.uploadAdminMedia(uploadFile, "image/png");
        homepageImage = uploadResult.url;
      }

      if (!homepageImage) {
        messageApi.warning("请先选择 PNG 文件或输入主页图 URL");
        return;
      }

      if (!isPngUrl(homepageImage)) {
        messageApi.warning("主页图必须是 PNG 格式");
        return;
      }

      await api.updateAvatarHomepageImage(selectedAvatarDetail.id, {
        homepageImageUrl: homepageImage,
      });
      messageApi.success("主页图已保存");
      handleCloseUploadModal();
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "主页图保存失败");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSubmitAction = async () => {
    if (!selectedAvatarDetail || !uploadActionType) {
      return;
    }

    setSubmittingAction(true);

    try {
      const existingAction = actionMap[uploadActionType];
      let imageUrl = uploadImageUrl.trim();

      if (uploadFile && existingAction) {
        await api.uploadAvatarActionVideo(selectedAvatarDetail.id, existingAction.id, uploadFile);
        messageApi.success("动作素材已替换");
        handleCloseUploadModal();
        await refreshCurrentAvatar(selectedAvatarDetail.id);
        setPreviewActionType(uploadActionType);
        return;
      }

      if (!imageUrl && uploadFile) {
        if (!isMjpegFile(uploadFile)) {
          messageApi.warning("仅支持 MJPEG 视频文件（.mjpeg / .mjpg）");
          return;
        }

        const contentType = resolveMjpegContentType(uploadFile);
        const uploadResult = await api.uploadAdminMedia(uploadFile, contentType);
        imageUrl = uploadResult.url;
      }

      if (!imageUrl) {
        messageApi.warning("请先选择 MJPEG 视频文件或输入视频 URL");
        return;
      }

      const actionResult = await api.createAvatarAction(selectedAvatarDetail.id, {
        actionType: uploadActionType,
        imageUrl,
      });

      if (uploadFile && actionResult.action?.id) {
        await api.uploadAvatarActionVideo(selectedAvatarDetail.id, actionResult.action.id, uploadFile);
      }

      messageApi.success("动作素材已上传");
      handleCloseUploadModal();
      await refreshCurrentAvatar(selectedAvatarDetail.id);
      setPreviewActionType(uploadActionType);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "动作素材上传失败");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSubmitUploadModal = async () => {
    if (uploadMode === "homepage") {
      await handleSubmitHomepageImage();
      return;
    }

    await handleSubmitAction();
  };

  const handleDeleteAction = async (action: CustomizationAction) => {
    if (!selectedAvatarDetail) {
      return;
    }

    setDeletingActionId(action.id);

    try {
      await api.deleteAvatarAction(selectedAvatarDetail.id, action.id);
      messageApi.success("动作素材已删除");
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "动作素材删除失败");
    } finally {
      setDeletingActionId(null);
    }
  };

  const handleSaveActionCategory = async (category: ActionCategoryFilter) => {
    if (!selectedAvatarDetail) {
      return;
    }

    setSavingActionCategory(category);

    try {
      const result = await api.saveAvatarActionCategory(selectedAvatarDetail.id, category);
      const categoryLabel = actionCategoryLabels[category];
      messageApi.success(`${categoryLabel}已保存：${result.saved}/${result.total}`);
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "动作保存失败");
    } finally {
      setSavingActionCategory(null);
    }
  };

  const handleSyncAvatar = async () => {
    if (!selectedAvatarDetail) {
      return;
    }

    setSyncing(true);

    try {
      await api.syncAvatar(selectedAvatarDetail.id);
      messageApi.success("已同步到手机端");
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const renderCategoryStatus = (avatar: CustomizationAvatar) => (
    <Tag color={hasPersonalizedTask(avatar) ? "purple" : "blue"}>
      {hasPersonalizedTask(avatar) ? "个性化定制" : "系统定制"}
    </Tag>
  );

  const renderActionSection = (category: ActionCategoryFilter, title: string, actions: readonly ActionType[]) => {
    const categoryProgress = getCategoryProgress(selectedActions, category);
    const isSavingCategory = savingActionCategory === category;

    return (
    <Card
      title={`${title}（${actions.length}个）`}
      styles={{ body: { padding: 16 } }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        {actions.map((actionType) => {
          const action = actionMap[actionType];
          const isDeleting = deletingActionId === action?.id;
          const isSelected = previewActionType === actionType;
          const canUploadCurrentAction = canEditActions || (canReplaceCompletedActions && !!action);

          return (
            <Card
              key={actionType}
              hoverable
              onClick={() => setPreviewActionType(actionType)}
              style={{
                borderColor: isSelected ? "#1677ff" : undefined,
                boxShadow: isSelected ? "0 0 0 2px rgba(22,119,255,0.12)" : undefined,
              }}
              styles={{
                body: {
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                },
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text strong style={{ fontSize: 13 }}>
                  {ACTION_LABELS[actionType] ?? actionType}
                </Text>
                {action ? <CheckOutlined style={{ color: "#52c41a" }} /> : null}
              </div>

              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#f5f5f5",
                }}
              >
                {action ? (
                  <Image
                    src={action.imageUrl}
                    alt={ACTION_LABELS[actionType] ?? actionType}
                    width="100%"
                    height="100%"
                    preview={false}
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#bfbfbf",
                      fontSize: 12,
                    }}
                  >
                    生成中
                  </div>
                )}
              </div>

              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                <Button
                  type={action ? "default" : "primary"}
                  size="small"
                  icon={<UploadOutlined />}
                  disabled={!canUploadCurrentAction}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenActionUploadModal(actionType);
                  }}
                >
                  {action && canReplaceCompletedActions ? "替换" : action ? "替换素材" : "上传素材"}
                </Button>

                {action ? (
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    disabled={!canEditActions}
                    loading={isDeleting}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteAction(action);
                    }}
                  >
                    删除
                  </Button>
                ) : null}
              </Space>
            </Card>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={isSavingCategory}
          disabled={!selectedAvatarDetail || categoryProgress.completed === 0}
          onClick={() => void handleSaveActionCategory(category)}
        >
          {`保存${title} ${categoryProgress.completed}/${categoryProgress.total}`}
        </Button>
      </div>
    </Card>
    );
  };

  const actionFilterOptions = [
    { label: `基础动作 ${BASIC_ACTIONS.length}个`, value: "basic" },
    { label: `趣味动作 ${FUN_ACTIONS.length}个`, value: "fun" },
    {
      label: `交互动作 ${INTERACTIVE_ACTIONS.length}个`,
      value: "interactive",
    },
  ] satisfies { label: string; value: ActionCategoryFilter; disabled?: boolean }[];

  const currentActionSection =
    actionFilter === "basic"
      ? renderActionSection("basic", "基础动作", BASIC_ACTIONS)
      : actionFilter === "fun"
        ? renderActionSection("fun", "趣味动作", FUN_ACTIONS)
        : renderActionSection("interactive", "交互动作", INTERACTIVE_ACTIONS);

  return (
    <>
      {contextHolder}
      <Spin spinning={loading} size="large">
        <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          <Card styles={{ body: { padding: 16 } }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  type={taskTab === "pending" ? "primary" : "default"}
                  onClick={() => setTaskTab("pending")}
                  style={{ flex: 1, height: 44 }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span>待定制</span>
                    <span
                      style={{
                        minWidth: 24,
                        height: 24,
                        padding: "0 6px",
                        borderRadius: 6,
                        background: "#fa8c16",
                        color: "#fff",
                        fontSize: 12,
                        lineHeight: "24px",
                        display: "inline-block",
                      }}
                    >
                      {todayNewPendingCount}
                    </span>
                  </span>
                </Button>
                <Button
                  type={taskTab === "done" ? "primary" : "default"}
                  onClick={() => setTaskTab("done")}
                  style={{ flex: 1, height: 44 }}
                >
                  已完成
                </Button>
              </div>

              <Segmented<TaskCategoryFilter>
                block
                value={categoryFilter}
                options={categoryOptions}
                onChange={(value) => setCategoryFilter(value)}
              />

              {filteredAvatars.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "calc(100vh - 220px)", overflowY: "auto", paddingRight: 4 }}>
                  {filteredAvatars.map((avatar) => {
                    const isSelected = avatar.id === selectedAvatarId;

                    return (
                      <Card
                        key={avatar.id}
                        hoverable
                        onClick={() => setSelectedAvatarId(avatar.id)}
                        style={{
                          borderColor: isSelected ? "#1677ff" : "#f0f0f0",
                          boxShadow: isSelected ? "0 0 0 2px rgba(22,119,255,0.12)" : "none",
                          cursor: "pointer",
                        }}
                        styles={{ body: { padding: 12 } }}
                      >
                        <div style={{ display: "flex", gap: 12 }}>
                          <Image
                            src={avatar.sourceImageUrl}
                            alt={avatar.pet?.name ?? "宠物头像"}
                            width={64}
                            height={64}
                            preview={false}
                            style={{ objectFit: "cover", borderRadius: 10, flexShrink: 0 }}
                          />

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                              <Text strong style={{ fontSize: 15 }}>
                                {avatar.user?.nickname ?? "未知微信用户"}
                              </Text>
                              {renderCategoryStatus(avatar)}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <Text style={{ fontSize: 13 }}>{`宠物姓名：${avatar.pet?.name ?? "未命名宠物"}`}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {`宠物品种：${avatar.pet?.breed ?? "-"}`}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {`宠物年龄：${getAgeLabel(avatar.pet?.birthday)}`}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {`宠物公母：${getGenderLabel(avatar.pet?.gender)}`}
                              </Text>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Empty description="暂无定制任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </div>
          </Card>

          {!selectedAvatarId || !selectedAvatarSummary ? (
            <Card style={{ minHeight: 640 }}>
              <Empty description="请选择左侧用户查看定制信息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </Card>
          ) : (
            <Spin spinning={detailLoading}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Card styles={{ body: { padding: 20, background: "#eef5ff", borderRadius: 8 } }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(420px, 1fr)", gap: 32, alignItems: "center" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(160px, 1fr))", gap: 20 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ aspectRatio: "1 / 1", borderRadius: 16, overflow: "hidden", background: "#dfe6f0" }}>
                          {selectedAvatarImage ? (
                            <Image
                              src={selectedAvatarImage}
                              alt={selectedAvatarDetail?.pet?.name ?? selectedAvatarSummary.pet?.name ?? "用户上传预览图"}
                              width="100%"
                              height="100%"
                              preview={false}
                              style={{ objectFit: "cover" }}
                            />
                          ) : (
                            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#8c9aae" }}>
                              用户上传预览图
                            </div>
                          )}
                        </div>
                        <Button
                          icon={<DownloadOutlined />}
                          disabled={!selectedAvatarImage}
                          onClick={() => {
                            if (!selectedAvatarImage) {
                              return;
                            }
                            void downloadImage(
                              selectedAvatarImage,
                              `${selectedAvatarFilePrefix}-source.jpg`,
                            ).catch((error) => {
                              messageApi.error(error instanceof Error ? error.message : "图片下载失败");
                            });
                          }}
                        >
                          下载原图
                        </Button>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ aspectRatio: "1 / 1", borderRadius: 16, overflow: "hidden", background: "#dfe6f0" }}>
                          {homepageImageUrl ? (
                            <Image
                              src={homepageImageUrl}
                              alt={selectedAvatarDetail?.pet?.name ?? selectedAvatarSummary.pet?.name ?? "手机端主页显示图"}
                              width="100%"
                              height="100%"
                              preview={false}
                              style={{ objectFit: "cover" }}
                            />
                          ) : (
                            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#8c9aae" }}>
                              手机端主页显示图
                            </div>
                          )}
                        </div>
                        <Button
                          icon={<UploadOutlined />}
                          disabled={!canEditHomepageImage}
                          onClick={handleOpenHomepageUploadModal}
                        >
                          {homepageImageUrl ? "修改主页图" : "上传主页图"}
                        </Button>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#6b8ff0", border: "3px solid #fff", flexShrink: 0 }} />
                        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                          <Title level={4} style={{ margin: 0, color: "#24418f" }}>
                            {`微信用户：${selectedAvatarDetail?.user?.nickname ?? selectedAvatarSummary.user?.nickname ?? "未知微信用户"}`}
                          </Title>
                          <Text strong style={{ color: "#24418f", fontSize: 16 }}>
                            {`宠物：${selectedAvatarDetail?.pet?.name ?? selectedAvatarSummary.pet?.name ?? "未命名宠物"} ${getSpeciesLabel(selectedAvatarDetail?.pet?.species ?? selectedAvatarSummary.pet?.species)} · ${getAgeLabel(selectedAvatarDetail?.pet?.birthday ?? selectedAvatarSummary.pet?.birthday)} · ${getGenderLabel(selectedAvatarDetail?.pet?.gender ?? selectedAvatarSummary.pet?.gender)}`}
                          </Text>
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <Text strong style={{ color: "#24418f" }}>上传进度 Upload Progress</Text>
                          <Text type="secondary">{`${clampedUploadedCompleted}/${totalActionCount}`}</Text>
                        </div>
                        <Progress percent={uploadedProgressPercent} showInfo={false} strokeColor="#52c41a" trailColor="#d9e7ff" />
                      </div>

                      <div style={{ background: "#fff", borderRadius: 16, padding: 20, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 20, alignItems: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                          <Text strong style={{ color: "#1f5f99", fontSize: 20 }}>{`${clampedUploadedCompleted} / ${totalActionCount} 动作已完成`}</Text>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                            <Text type="secondary" style={{ flexShrink: 0 }}>宠物描述</Text>
                            <Input
                              value={petDescriptionDraft}
                              placeholder="请输入宠物描述"
                              maxLength={100}
                              onChange={(event) => setPetDescriptionDraft(event.target.value)}
                              style={{ minWidth: 180 }}
                            />
                            <Button
                              loading={metaSaving}
                              disabled={petDescriptionDraft.trim() === selectedPetDescription}
                              onClick={() => void handleSavePetDescription()}
                            >
                              保存
                            </Button>
                          </div>
                        </div>

                        <Button
                          type="primary"
                          size="large"
                          icon={<SyncOutlined />}
                          disabled={!canSync}
                          loading={syncing}
                          style={{ background: "#49aa7a", borderColor: "#49aa7a", height: 56 }}
                          onClick={() => void handleSyncAvatar()}
                        >
                          {selectedAvatarDetail?.status === "done" ? "已同步到手机端" : "一键同步到手机"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {referenceImages.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <Text strong>个性化参考图</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          每张图都可单独下载，便于离线手动定制
                        </Text>
                      </div>

                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {referenceImages.map((url, index) => (
                          <div
                            key={url}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              alignItems: "stretch",
                            }}
                          >
                            <Image
                              src={url}
                              alt="个性化参考图"
                              width={88}
                              height={88}
                              preview={false}
                              style={{ objectFit: "cover", borderRadius: 12 }}
                            />
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              onClick={() => {
                                void downloadImage(
                                  url,
                                  `${selectedAvatarFilePrefix}-reference-${index + 1}.jpg`,
                                ).catch((error) => {
                                  messageApi.error(error instanceof Error ? error.message : "图片下载失败");
                                });
                              }}
                            >
                              下载
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Card>

                <Segmented<ActionCategoryFilter>
                  value={actionFilter}
                  options={actionFilterOptions}
                  onChange={(value) => setActionFilter(value)}
                  style={{ width: "fit-content" }}
                />
                {currentActionSection}
              </div>
            </Spin>
          )}
        </div>
      </Spin>

      <Modal
        title={
          uploadMode === "homepage"
            ? "上传主页图"
            : uploadActionType
              ? `上传${ACTION_LABELS[uploadActionType] ?? uploadActionType}`
              : "上传动作素材"
        }
        open={uploadModalOpen}
        onOk={() => void handleSubmitUploadModal()}
        okText="确认"
        cancelText="取消"
        confirmLoading={submittingAction}
        onCancel={handleCloseUploadModal}
        destroyOnClose
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Text type="secondary">
              {uploadMode === "homepage" ? "上传 PNG 图片文件" : "上传 MJPEG 视频文件"}
            </Text>
            <input
              type="file"
              accept={uploadMode === "homepage" ? HOMEPAGE_IMAGE_ACCEPT : CUSTOMIZATION_VIDEO_ACCEPT}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setUploadFile(nextFile);
                if (nextFile) {
                  setUploadImageUrl("");
                }
              }}
            />
          </div>

          <Input
            placeholder={uploadMode === "homepage" ? "或输入主页图 URL（PNG）" : "或输入 MJPEG 视频 URL"}
            value={uploadImageUrl}
            onChange={(event) => {
              setUploadImageUrl(event.target.value);
              if (event.target.value.trim()) {
                setUploadFile(null);
              }
            }}
          />

          {uploadPreviewUrl ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              {shouldPreviewAsVideo(uploadMode, uploadFile, uploadPreviewUrl) ? (
                <video
                  src={uploadPreviewUrl}
                  controls
                  preload="metadata"
                  playsInline
                  style={{ width: 240, height: 240, objectFit: "cover", borderRadius: 12, background: "#0f172a" }}
                />
              ) : (
                <Image
                  src={uploadPreviewUrl}
                  alt={uploadMode === "homepage" ? "主页图预览" : uploadActionType ? ACTION_LABELS[uploadActionType] ?? uploadActionType : "动作预览"}
                  width={240}
                  height={240}
                  style={{ objectFit: "cover", borderRadius: 12 }}
                />
              )}
            </div>
          ) : (
            <Empty
              description={uploadMode === "homepage" ? "选择 PNG 文件或输入 URL 后可预览" : "选择 MJPEG 视频文件或输入视频 URL 后可预览"}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
