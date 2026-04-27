import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
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
  BASIC_ACTIONS,
  FUN_ACTIONS,
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

type CustomizationStatus = "approved" | "processing" | "done";
type TaskTab = "pending" | "done";
type CategoryFilter = "all" | "basic" | "fun";

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

type UploadContentType = "image/jpeg" | "image/png" | "image/webp";

const TASK_STATUSES: CustomizationStatus[] = ["approved", "processing", "done"];

const categoryOptions = [
  { label: "全部图像类别", value: "all" },
  { label: "基础动作", value: "basic" },
  { label: "个性化动作", value: "fun" },
] satisfies { label: string; value: CategoryFilter }[];

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

function buildActionMap(actions: PetAvatarAction[]) {
  return actions.reduce<Record<string, CustomizationAction>>((map, action) => {
    map[action.actionType] = action as CustomizationAction;
    return map;
  }, {});
}

function countCompletedActions(actions: PetAvatarAction[], actionTypes: readonly ActionType[]) {
  const actionTypeSet = new Set(actionTypes);
  return actions.filter((action) => actionTypeSet.has(action.actionType as ActionType)).length;
}

function getCategoryProgress(actions: PetAvatarAction[], category: CategoryFilter): CategoryProgress {
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

  return {
    completed: actions.length,
    total: BASIC_ACTIONS.length + FUN_ACTIONS.length,
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

function openImageDownload(imageUrl: string, fallbackName: string) {
  const link = document.createElement("a");
  link.href = imageUrl;
  link.download = fallbackName;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function toCustomizationTaskSummary(avatar: CustomizationAvatarDetail): CustomizationTask {
  const baseActionCount = countCompletedActions(avatar.actions, BASIC_ACTIONS);
  const personalizedActionCount = countCompletedActions(avatar.actions, FUN_ACTIONS);
  const totalActionCount = avatar.actions.length;

  return {
    avatarId: avatar.id,
    petId: avatar.petId,
    petName: avatar.pet?.name ?? "未命名宠物",
    petSpecies: (avatar.pet?.species === "dog" ? "dog" : "cat") as Species,
    petBreed: avatar.pet?.breed ?? null,
    petGender: avatar.pet?.gender ?? "unknown",
    petBirthday: avatar.pet?.birthday ?? null,
    userId: avatar.user?.id ?? "demo-user",
    userNickname: avatar.user?.nickname ?? "未知微信用户",
    userAvatarUrl: avatar.user?.avatarUrl ?? null,
    userPhone: avatar.user?.phone ?? null,
    status: avatar.status,
    defaultPreviewUrl: avatar.actions[0]?.imageUrl ?? avatar.sourceImageUrl,
    baseActionCount,
    personalizedActionCount,
    totalActionCount,
    baseActionTotal: BASIC_ACTIONS.length,
    personalizedActionTotal: FUN_ACTIONS.length,
    categoryStatus:
      totalActionCount === 0
        ? "empty"
        : totalActionCount >= BASIC_ACTIONS.length + FUN_ACTIONS.length
          ? "all_done"
          : baseActionCount > 0
            ? "base_done"
            : "partial",
    isNewToday: enteredCustomizationToday(avatar),
    createdAt: avatar.createdAt,
    reviewedAt: avatar.reviewedAt ?? null,
  };
}

function createTaskPreview(task: CustomizationTask) {
  return buildMockImageUrl(task.petName, "#91caff", `${task.userNickname} · 定制任务`);
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
      sourceImageUrl: avatar?.sourceImageUrl ?? task.defaultPreviewUrl ?? createTaskPreview(task),
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

function getTaskProgress(task: CustomizationTask | null | undefined, category: CategoryFilter): CategoryProgress | null {
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
      completed: task.personalizedActionCount,
      total: task.personalizedActionTotal,
    };
  }

  return {
    completed: task.totalActionCount,
    total: task.baseActionTotal + task.personalizedActionTotal,
  };
}

function buildMockImageUrl(title: string, accent: string, subtitle: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#fff7e6" stop-opacity="1" />
        </linearGradient>
      </defs>
      <rect width="1200" height="1200" fill="url(#bg)" />
      <circle cx="930" cy="220" r="150" fill="#ffffff" fill-opacity="0.25" />
      <circle cx="250" cy="910" r="200" fill="#ffffff" fill-opacity="0.18" />
      <rect x="120" y="160" width="960" height="880" rx="52" fill="#ffffff" fill-opacity="0.72" />
      <text x="180" y="430" font-size="88" font-family="Arial, sans-serif" font-weight="700" fill="#1f1f1f">${title}</text>
      <text x="180" y="540" font-size="40" font-family="Arial, sans-serif" fill="#434343">${subtitle}</text>
      <text x="180" y="640" font-size="30" font-family="Arial, sans-serif" fill="#595959">Customization Demo</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function toCustomizationAvatarSummary(avatar: CustomizationAvatarDetail): CustomizationAvatar {
  const { actions: _actions, ...summary } = avatar;
  return {
    ...summary,
    task: toCustomizationTaskSummary(avatar),
  };
}

function createMockCustomizationDetails(): CustomizationAvatarDetail[] {
  return [
    {
      id: "mock-custom-avatar-1",
      petId: "mock-custom-pet-1",
      sourceImageUrl: buildMockImageUrl("布丁", "#ffd666", "待定制 · 今日新增"),
      status: "approved",
      rejectReason: null,
      reviewedAt: dayjs().subtract(30, "minute").toISOString(),
      createdAt: dayjs().subtract(2, "hour").toISOString(),
      pet: {
        id: "mock-custom-pet-1",
        name: "布丁",
        species: "cat",
        breed: "英短",
        gender: "female",
        birthday: dayjs().subtract(8, "month").format("YYYY-MM-DD"),
      },
      user: {
        id: "mock-custom-user-1",
        nickname: "Momo",
        avatarUrl: null,
        wechatOpenid: "mock-custom-openid-1",
        phone: "13800000011",
      },
      actions: [],
    },
    {
      id: "mock-custom-avatar-2",
      petId: "mock-custom-pet-2",
      sourceImageUrl: buildMockImageUrl("栗子", "#95de64", "进行中 · 基础动作"),
      status: "processing",
      rejectReason: null,
      reviewedAt: dayjs().subtract(4, "hour").toISOString(),
      createdAt: dayjs().subtract(6, "hour").toISOString(),
      pet: {
        id: "mock-custom-pet-2",
        name: "栗子",
        species: "dog",
        breed: "柯基",
        gender: "male",
        birthday: dayjs().subtract(2, "year").format("YYYY-MM-DD"),
      },
      user: {
        id: "mock-custom-user-2",
        nickname: "Cookie",
        avatarUrl: null,
        wechatOpenid: "mock-custom-openid-2",
        phone: "13800000012",
      },
      actions: [
        {
          id: "mock-custom-action-1",
          petAvatarId: "mock-custom-avatar-2",
          actionType: "sit",
          imageUrl: buildMockImageUrl("栗子", "#b7eb8f", "基础动作 · sit"),
          sortOrder: 0,
        },
        {
          id: "mock-custom-action-2",
          petAvatarId: "mock-custom-avatar-2",
          actionType: "eat",
          imageUrl: buildMockImageUrl("栗子", "#d9f7be", "基础动作 · eat"),
          sortOrder: 1,
        },
        {
          id: "mock-custom-action-3",
          petAvatarId: "mock-custom-avatar-2",
          actionType: "play_ball",
          imageUrl: buildMockImageUrl("栗子", "#73d13d", "个性化动作 · play_ball"),
          sortOrder: 2,
        },
      ],
    },
    {
      id: "mock-custom-avatar-3",
      petId: "mock-custom-pet-3",
      sourceImageUrl: buildMockImageUrl("可颂", "#69b1ff", "已完成 · 同步到手机端"),
      status: "done",
      rejectReason: null,
      reviewedAt: dayjs().subtract(1, "day").add(3, "hour").toISOString(),
      createdAt: dayjs().subtract(2, "day").toISOString(),
      pet: {
        id: "mock-custom-pet-3",
        name: "可颂",
        species: "dog",
        breed: "比熊",
        gender: "female",
        birthday: dayjs().subtract(1, "year").subtract(3, "month").format("YYYY-MM-DD"),
      },
      user: {
        id: "mock-custom-user-3",
        nickname: "Luna",
        avatarUrl: null,
        wechatOpenid: "mock-custom-openid-3",
        phone: "13800000013",
      },
      actions: [
        ...BASIC_ACTIONS.map((actionType, index) => ({
          id: `mock-custom-action-basic-${index + 1}`,
          petAvatarId: "mock-custom-avatar-3",
          actionType,
          imageUrl: buildMockImageUrl("可颂", "#91caff", `基础动作 · ${ACTION_LABELS[actionType] ?? actionType}`),
          sortOrder: index,
        })),
        ...FUN_ACTIONS.slice(0, 2).map((actionType, index) => ({
          id: `mock-custom-action-fun-${index + 1}`,
          petAvatarId: "mock-custom-avatar-3",
          actionType,
          imageUrl: buildMockImageUrl("可颂", "#adc6ff", `个性化动作 · ${ACTION_LABELS[actionType] ?? actionType}`),
          sortOrder: BASIC_ACTIONS.length + index,
        })),
      ],
    },
  ];
}

function applyDemoDataState(
  setDemoAvatarDetails: (details: CustomizationAvatarDetail[]) => void,
  setAvatars: (avatars: CustomizationAvatar[]) => void,
  setIsDemoMode: (value: boolean) => void,
) {
  const nextDemoDetails = createMockCustomizationDetails();
  setDemoAvatarDetails(nextDemoDetails);
  setAvatars(nextDemoDetails.map(toCustomizationAvatarSummary));
  setIsDemoMode(true);
  return nextDemoDetails;
}

const initialDemoDetails = createMockCustomizationDetails();

export default function Customization() {
  const [messageApi, contextHolder] = message.useMessage();
  const [avatars, setAvatars] = useState<CustomizationAvatar[]>(() => initialDemoDetails.map(toCustomizationAvatarSummary));
  const [demoAvatarDetails, setDemoAvatarDetails] = useState<CustomizationAvatarDetail[]>(() => initialDemoDetails);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [todayNewPendingCount, setTodayNewPendingCount] = useState(
    initialDemoDetails.filter((avatar) => enteredCustomizationToday(avatar)).length,
  );
  const [taskTab, setTaskTab] = useState<TaskTab>("pending");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedAvatarDetail, setSelectedAvatarDetail] = useState<CustomizationAvatarDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewActionType, setPreviewActionType] = useState<ActionType | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadActionType, setUploadActionType] = useState<ActionType | null>(null);
  const [uploadImageUrl, setUploadImageUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null);
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

      if (nextAvatars.length === 0) {
        const demoDetails = applyDemoDataState(setDemoAvatarDetails, setAvatars, setIsDemoMode);
        setTodayNewPendingCount(demoDetails.filter((avatar) => enteredCustomizationToday(avatar)).length);
        messageApi.warning("未获取到真实定制任务，当前展示演示数据");
        return;
      }

      setIsDemoMode(false);
      setDemoAvatarDetails([]);
      setAvatars(nextAvatars);
      setTodayNewPendingCount(pendingTasks.filter((task) => task.isNewToday).length);
    } catch (error) {
      const demoDetails = applyDemoDataState(setDemoAvatarDetails, setAvatars, setIsDemoMode);
      setTodayNewPendingCount(demoDetails.filter((avatar) => enteredCustomizationToday(avatar)).length);
      messageApi.warning("定制任务加载失败，当前展示演示数据");
    } finally {
      setLoading(false);
    }
  };

  const loadAvatarDetail = async (avatarId: string, options?: { keepLoading?: boolean }) => {
    const requestId = ++detailRequestRef.current;

    if (isDemoMode) {
      const detail = demoAvatarDetails.find((avatar) => avatar.id === avatarId) ?? null;
      setSelectedAvatarDetail(detail);
      setPreviewActionType((current) => {
        if (current && detail?.actions.some((action) => action.actionType === current)) {
          return current;
        }

        return detail ? getDefaultPreviewActionType(detail.actions) : null;
      });
      return detail;
    }

    if (!options?.keepLoading) {
      setDetailLoading(true);
    }

    try {
      const response = await api.getAvatar(avatarId);
      const detail = response.avatar as CustomizationAvatarDetail;

      if (detailRequestRef.current === requestId) {
        setSelectedAvatarDetail(detail);
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

        const progress = getTaskProgress(avatar.task, categoryFilter);
        return (progress?.completed ?? 0) > 0;
      }),
    [categoryFilter, tabAvatars],
  );

  useEffect(() => {
    if (filteredAvatars.length === 0) {
      setSelectedAvatarId(null);
      setSelectedAvatarDetail(null);
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
  }, [demoAvatarDetails, isDemoMode, selectedAvatarId]);

  const selectedAvatarSummary = useMemo(
    () => avatars.find((avatar) => avatar.id === selectedAvatarId) ?? null,
    [avatars, selectedAvatarId],
  );

  const actionMap = useMemo(
    () => buildActionMap(selectedAvatarDetail?.actions ?? []),
    [selectedAvatarDetail?.actions],
  );

  const selectedActions = selectedAvatarDetail?.actions ?? [];
  const totalActionCount = BASIC_ACTIONS.length + FUN_ACTIONS.length;
  const uploadedProgress = getCategoryProgress(selectedActions, "all");
  const basicProgress = getCategoryProgress(selectedActions, "basic");
  const funProgress = getCategoryProgress(selectedActions, "fun");
  const canEditActions = selectedAvatarDetail?.status === "approved" || selectedAvatarDetail?.status === "processing";
  const canSync = !!selectedAvatarDetail && uploadedProgress.completed > 0 && selectedAvatarDetail.status !== "done";

  const previewAction = previewActionType ? actionMap[previewActionType] : undefined;
  const previewImageUrl = previewAction?.imageUrl ?? selectedAvatarDetail?.sourceImageUrl ?? selectedAvatarSummary?.sourceImageUrl ?? "";
  const selectedAvatarImage =
    selectedAvatarDetail?.sourceImageUrl ?? selectedAvatarSummary?.sourceImageUrl ?? "";
  const referenceImages = parseAdditionalImages(
    selectedAvatarDetail?.additionalImageUrls ?? selectedAvatarSummary?.additionalImageUrls,
  );
  const selectedAvatarFilePrefix = selectedAvatarSummary?.id ?? selectedAvatarId ?? "avatar";

  const refreshCurrentAvatar = async (avatarId: string, nextDemoDetails?: CustomizationAvatarDetail[]) => {
    if (isDemoMode) {
      const currentDemoDetails = nextDemoDetails ?? demoAvatarDetails;
      const nextDetail = currentDemoDetails.find((avatar) => avatar.id === avatarId) ?? null;
      setAvatars(currentDemoDetails.map(toCustomizationAvatarSummary));
      setSelectedAvatarDetail(nextDetail);
      return;
    }

    await Promise.all([loadAvatars(), loadAvatarDetail(avatarId, { keepLoading: true })]);
  };

  const handleOpenUploadModal = (actionType: ActionType) => {
    setUploadActionType(actionType);
    setUploadImageUrl("");
    setUploadFile(null);
    setUploadModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    setUploadModalOpen(false);
    setUploadActionType(null);
    setUploadImageUrl("");
    setUploadFile(null);
    setUploadPreviewUrl("");
  };

  const handleSubmitAction = async () => {
    if (!selectedAvatarDetail || !uploadActionType) {
      return;
    }

    setSubmittingAction(true);

    try {
      let imageUrl = uploadImageUrl.trim();

      if (!imageUrl && uploadFile && isDemoMode) {
        imageUrl = uploadPreviewUrl;
      }

      if (!imageUrl && uploadFile && !isDemoMode) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(uploadFile.type)) {
          messageApi.warning("仅支持 JPG、PNG、WEBP 图片");
          return;
        }

        const presign = await api.createUploadPresign(uploadFile.type as UploadContentType);
        const uploadResponse = await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": uploadFile.type,
          },
          body: uploadFile,
        });

        if (!uploadResponse.ok) {
          throw new Error("素材文件上传失败");
        }

        imageUrl = presign.publicUrl;
      }

      if (!imageUrl) {
        messageApi.warning("请先选择图片文件或输入图片 URL");
        return;
      }

      if (isDemoMode) {
        const nextDemoDetails: CustomizationAvatarDetail[] = demoAvatarDetails.map((avatar) => {
          if (avatar.id !== selectedAvatarDetail.id) {
            return avatar;
          }

          const existingAction = avatar.actions.find((action) => action.actionType === uploadActionType);
          const nextAction = existingAction
            ? {
                ...existingAction,
                imageUrl,
              }
            : {
                id: `mock-custom-action-${Date.now()}`,
                petAvatarId: avatar.id,
                actionType: uploadActionType,
                imageUrl,
                sortOrder: avatar.actions.length,
              };

          return {
            ...avatar,
            status: avatar.status === "approved" ? ("processing" as const) : avatar.status,
            actions: existingAction
              ? avatar.actions.map((action) => (action.actionType === uploadActionType ? nextAction : action))
              : [...avatar.actions, nextAction],
          };
        });

        setDemoAvatarDetails(nextDemoDetails);
        messageApi.success("演示动作素材已上传");
        handleCloseUploadModal();
        await refreshCurrentAvatar(selectedAvatarDetail.id, nextDemoDetails);
        setPreviewActionType(uploadActionType);
        return;
      }

      await api.createAvatarAction(selectedAvatarDetail.id, {
        actionType: uploadActionType,
        imageUrl,
      });
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

  const handleDeleteAction = async (action: CustomizationAction) => {
    if (!selectedAvatarDetail) {
      return;
    }

    setDeletingActionId(action.id);

    try {
      if (isDemoMode) {
        const nextDemoDetails: CustomizationAvatarDetail[] = demoAvatarDetails.map((avatar) => {
          if (avatar.id !== selectedAvatarDetail.id) {
            return avatar;
          }

          const nextActions = avatar.actions.filter((item) => item.id !== action.id);
          return {
            ...avatar,
            status: nextActions.length === 0 && avatar.status === "processing" ? ("approved" as const) : avatar.status,
            actions: nextActions,
          };
        });

        setDemoAvatarDetails(nextDemoDetails);
        messageApi.success("演示动作素材已删除");
        await refreshCurrentAvatar(selectedAvatarDetail.id, nextDemoDetails);
        setPreviewActionType((current) => {
          if (current !== action.actionType) {
            return current;
          }

          const nextAvatar = nextDemoDetails.find((avatar) => avatar.id === selectedAvatarDetail.id);
          return getDefaultPreviewActionType(nextAvatar?.actions ?? []);
        });
        return;
      }

      await api.deleteAvatarAction(selectedAvatarDetail.id, action.id);
      messageApi.success("动作素材已删除");
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "动作素材删除失败");
    } finally {
      setDeletingActionId(null);
    }
  };

  const handleSyncAvatar = async () => {
    if (!selectedAvatarDetail) {
      return;
    }

    setSyncing(true);

    try {
      if (isDemoMode) {
        const nextDemoDetails: CustomizationAvatarDetail[] = demoAvatarDetails.map((avatar) =>
          avatar.id === selectedAvatarDetail.id
            ? {
                ...avatar,
                status: "done" as const,
              }
            : avatar,
        );

        setDemoAvatarDetails(nextDemoDetails);
        messageApi.success("演示任务已同步到手机端");
        await refreshCurrentAvatar(selectedAvatarDetail.id, nextDemoDetails);
        return;
      }

      await api.syncAvatar(selectedAvatarDetail.id);
      messageApi.success("已同步到手机端");
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const renderCategoryStatus = (avatar: CustomizationAvatar) => {
    const avatarActions = selectedAvatarDetail?.id === avatar.id ? selectedAvatarDetail.actions : [];
    const basicTaskProgress = getTaskProgress(avatar.task, "basic");
    const funTaskProgress = getTaskProgress(avatar.task, "fun");

    if (avatarActions.length === 0 && !avatar.task) {
      const meta = getStatusMetaForAvatarStatus(avatar.status as CustomizationStatus);

      if (categoryFilter === "basic") {
        return <Tag color={meta.color}>{`基础动作 · ${meta.label}`}</Tag>;
      }

      if (categoryFilter === "fun") {
        return <Tag color={meta.color}>{`个性化动作 · ${meta.label}`}</Tag>;
      }

      return (
        <Space size={[6, 6]} wrap>
          <Tag color={meta.color}>{`基础动作 · ${meta.label}`}</Tag>
          <Tag color={meta.color}>{`个性化动作 · ${meta.label}`}</Tag>
        </Space>
      );
    }

    if (categoryFilter === "basic") {
      const meta = getCategoryStatusTag(basicTaskProgress ?? getCategoryProgress(avatarActions, "basic"));
      return <Tag color={meta.color}>{`基础动作 · ${meta.label}`}</Tag>;
    }

    if (categoryFilter === "fun") {
      const meta = getCategoryStatusTag(funTaskProgress ?? getCategoryProgress(avatarActions, "fun"));
      return <Tag color={meta.color}>{`个性化动作 · ${meta.label}`}</Tag>;
    }

    const basicMeta = getCategoryStatusTag(basicTaskProgress ?? getCategoryProgress(avatarActions, "basic"));
    const funMeta = getCategoryStatusTag(funTaskProgress ?? getCategoryProgress(avatarActions, "fun"));

    return (
      <Space size={[6, 6]} wrap>
        <Tag color={basicMeta.color}>{`基础动作 · ${basicMeta.label}`}</Tag>
        <Tag color={funMeta.color}>{`个性化动作 · ${funMeta.label}`}</Tag>
      </Space>
    );
  };

  const renderActionSection = (title: string, actions: readonly ActionType[]) => (
    <Card
      title={title}
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
                    暂未上传
                  </div>
                )}
              </div>

              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                <Button
                  type={action ? "default" : "primary"}
                  size="small"
                  icon={<UploadOutlined />}
                  disabled={!canEditActions}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenUploadModal(actionType);
                  }}
                >
                  {action ? "替换素材" : "上传素材"}
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
    </Card>
  );

  return (
    <>
      {contextHolder}
      <Spin spinning={loading} size="large">
        <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          <Card styles={{ body: { padding: 16 } }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {isDemoMode ? (
                <Tag color="gold" style={{ width: "fit-content", marginInlineEnd: 0 }}>
                  演示数据
                </Tag>
              ) : null}

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

              <Segmented<CategoryFilter>
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
                <Card styles={{ body: { padding: 16 } }}>
                  <div style={{ display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 16, flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: 128,
                          height: 128,
                          borderRadius: 14,
                          overflow: "hidden",
                          background: "#f5f5f5",
                          flexShrink: 0,
                        }}
                      >
                          {previewImageUrl ? (
                            <Image
                              src={previewImageUrl}
                            alt={selectedAvatarDetail?.pet?.name ?? selectedAvatarSummary.pet?.name ?? "预览图"}
                            width={128}
                            height={128}
                            preview={false}
                            style={{ objectFit: "cover" }}
                            />
                          ) : null}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {selectedAvatarImage ? (
                          <Button
                            icon={<DownloadOutlined />}
                            onClick={() =>
                              openImageDownload(
                                selectedAvatarImage,
                                `${selectedAvatarFilePrefix}-source.jpg`,
                              )
                            }
                          >
                            下载原图
                          </Button>
                        ) : null}
                      </div>

                      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <Title level={4} style={{ margin: 0 }}>
                          {selectedAvatarDetail?.user?.nickname ?? selectedAvatarSummary.user?.nickname ?? "未知微信用户"}
                        </Title>
                        <Text>{`宠物名称：${selectedAvatarDetail?.pet?.name ?? selectedAvatarSummary.pet?.name ?? "未命名宠物"}`}</Text>
                        <Text>{`类别：${getSpeciesLabel(selectedAvatarDetail?.pet?.species ?? selectedAvatarSummary.pet?.species)}`}</Text>
                        <Text>{`年龄：${getAgeLabel(selectedAvatarDetail?.pet?.birthday ?? selectedAvatarSummary.pet?.birthday)}`}</Text>
                        <Text>{`公母：${getGenderLabel(selectedAvatarDetail?.pet?.gender ?? selectedAvatarSummary.pet?.gender)}`}</Text>
                      </div>
                    </div>

                    <Button
                      type="primary"
                      size="large"
                      icon={<SyncOutlined />}
                      disabled={!canSync}
                      loading={syncing}
                      style={{ background: "#52c41a", borderColor: "#52c41a" }}
                      onClick={() => void handleSyncAvatar()}
                    >
                      {selectedAvatarDetail?.status === "done" ? "已同步到手机端" : "一键同步到手机端"}
                    </Button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text strong>上传进度</Text>
                        <Text type="secondary">{`${uploadedProgress.completed}/${totalActionCount}`}</Text>
                      </div>
                      <Progress percent={Math.round((uploadedProgress.completed / totalActionCount) * 100)} showInfo={false} strokeColor="#1677ff" />
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text strong>动作完成进度</Text>
                        <Text type="secondary">{`${uploadedProgress.completed}/${totalActionCount} 已完成`}</Text>
                      </div>
                      <Progress percent={Math.round((uploadedProgress.completed / totalActionCount) * 100)} showInfo={false} strokeColor="#52c41a" />
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
                              onClick={() =>
                                openImageDownload(
                                  url,
                                  `${selectedAvatarFilePrefix}-reference-${index + 1}.jpg`,
                                )
                              }
                            >
                              下载
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Card>

                {renderActionSection("基础动作", BASIC_ACTIONS)}
                {renderActionSection("个性化动作", FUN_ACTIONS)}
              </div>
            </Spin>
          )}
        </div>
      </Spin>

      <Modal
        title={uploadActionType ? `上传${ACTION_LABELS[uploadActionType] ?? uploadActionType}` : "上传动作素材"}
        open={uploadModalOpen}
        onOk={() => void handleSubmitAction()}
        okText="确认"
        cancelText="取消"
        confirmLoading={submittingAction}
        onCancel={handleCloseUploadModal}
        destroyOnClose
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Text type="secondary">上传图片文件</Text>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
            placeholder="或输入图片 URL"
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
              <Image
                src={uploadPreviewUrl}
                alt={uploadActionType ? ACTION_LABELS[uploadActionType] ?? uploadActionType : "动作预览"}
                width={240}
                height={240}
                style={{ objectFit: "cover", borderRadius: 12 }}
              />
            </div>
          ) : (
            <Empty description="选择图片文件或输入图片 URL 后可预览" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>
      </Modal>
    </>
  );
}
