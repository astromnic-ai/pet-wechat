import { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import type { MenuProps } from "antd";
import { Layout, Menu, Typography, Modal, Input, Button, Space, Card, Alert } from "antd";
import {
  UserOutlined,
  HeartOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  CalendarOutlined,
  PictureOutlined,
  ScissorOutlined,
  MobileOutlined,
  BarChartOutlined,
  SettingOutlined,
  LogoutOutlined,
  CloudUploadOutlined,
  DeploymentUnitOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { getAdminKey, setAdminKey, verifyAdminKey } from "./api/client";

const { Header, Sider, Content } = Layout;
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SchedulesPage = lazy(() => import("./pages/Schedules"));
const ImageReviewPage = lazy(() => import("./pages/ImageReview"));
const CustomizationPage = lazy(() => import("./pages/Customization"));
const DevicesPage = lazy(() => import("./pages/Devices"));
const AnalyticsPage = lazy(() => import("./pages/Analytics"));
const UsersPage = lazy(() => import("./pages/Users"));
const PetsPage = lazy(() => import("./pages/Pets"));
const CollarsPage = lazy(() => import("./pages/Collars"));
const DesktopsPage = lazy(() => import("./pages/Desktops"));
const EventsPage = lazy(() => import("./pages/Events"));
const OtaFirmwarePage = lazy(() => import("./pages/ota/Firmware"));
const OtaInternalPage = lazy(() => import("./pages/ota/Internal"));
const OtaRegistryPage = lazy(() => import("./pages/ota/Registry"));
const OtaDispatchPage = lazy(() => import("./pages/ota/Dispatch"));
const OtaTokensPage = lazy(() => import("./pages/ota/Tokens"));

const menuItems: MenuProps["items"] = [
  {
    type: "group",
    key: "operations",
    label: "运营管理",
    children: [
      { key: "/", icon: <DashboardOutlined />, label: "系统概览" },
      { key: "/schedules", icon: <CalendarOutlined />, label: "行为日程" },
      { key: "/image-review", icon: <PictureOutlined />, label: "图像审核" },
      { key: "/customization", icon: <ScissorOutlined />, label: "定制中心" },
      { key: "/analytics", icon: <BarChartOutlined />, label: "数据看板" },
      { key: "/devices", icon: <MobileOutlined />, label: "设备管理" },
      { key: "/users", icon: <UserOutlined />, label: "用户会员" },
    ],
  },
  {
    key: "ota",
    label: "OTA 管理",
    children: [
      { key: "/ota/firmware", icon: <CloudUploadOutlined />, label: "固件版本" },
      { key: "/ota/internal", icon: <SafetyCertificateOutlined />, label: "内测白名单" },
      { key: "/ota/registry", icon: <MobileOutlined />, label: "设备清册" },
      { key: "/ota/dispatch", icon: <DeploymentUnitOutlined />, label: "下发记录" },
      { key: "/ota/tokens", icon: <SafetyCertificateOutlined />, label: "上传 Token" },
    ],
  },
  {
    key: "dev-tools",
    label: "开发工具",
    children: [
      { key: "/pets", icon: <HeartOutlined />, label: "宠物管理" },
      { key: "/collars", icon: <MobileOutlined />, label: "项圈管理" },
      { key: "/desktops", icon: <MobileOutlined />, label: "桌面端管理" },
      { key: "/events", icon: <ThunderboltOutlined />, label: "模拟事件" },
    ],
  },
];

const menuRouteKeys = [
  "/",
  "/schedules",
  "/image-review",
  "/customization",
  "/devices",
  "/analytics",
  "/users",
  "/ota/firmware",
  "/ota/internal",
  "/ota/registry",
  "/ota/dispatch",
  "/ota/tokens",
  "/pets",
  "/collars",
  "/desktops",
  "/events",
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [isAuthed, setIsAuthed] = useState(() => !!getAdminKey());
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [loginKeyInput, setLoginKeyInput] = useState("");
  const [settingsKeyInput, setSettingsKeyInput] = useState(getAdminKey());
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key !== "adminKey") {
        return;
      }

      const nextKey = event.newValue || "";
      setIsAuthed(!!nextKey);
      setSettingsKeyInput(nextKey);

      if (!nextKey) {
        setLoginError("");
        setLoginLoading(false);
      }
    };

    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const handleSaveKey = () => {
    setAdminKey(settingsKeyInput);
    setKeyModalOpen(false);
    window.location.reload();
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError("");

    try {
      const ok = await verifyAdminKey(loginKeyInput);

      if (!ok) {
        setLoginError("Admin Key 无效，请重新输入");
        return;
      }

      setAdminKey(loginKeyInput);
      setSettingsKeyInput(loginKeyInput);
      setIsAuthed(true);
    } catch {
      setLoginError("登录验证失败，请稍后重试");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminKey");
    setIsAuthed(false);
    setSettingsKeyInput("");
    setLoginKeyInput("");
    setLoginError("");
  };

  const selectedMenuKey = menuRouteKeys.find((key) => (
    key === "/"
      ? location.pathname === "/"
      : location.pathname === key || location.pathname.startsWith(`${key}/`)
  )) ?? "/";

  if (!isAuthed) {
    return (
      <Layout
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Card title="YEHEY 管理后台" style={{ width: "100%", maxWidth: 400 }}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Input.Password
              value={loginKeyInput}
              onChange={(event) => setLoginKeyInput(event.target.value)}
              onPressEnter={() => void handleLogin()}
              placeholder="请输入 Admin Key"
            />
            {loginError ? <Alert type="error" message={loginError} showIcon /> : null}
            <Button type="primary" block loading={loginLoading} onClick={() => void handleLogin()}>
              登录
            </Button>
          </Space>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{ height: 32, margin: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography.Text strong style={{ color: "#fff", fontSize: collapsed ? 14 : 16 }}>
            {collapsed ? "YH" : "YEHEY 管理后台"}
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          defaultOpenKeys={["dev-tools"]}
          items={menuItems}
          onClick={({ key }) => navigate(String(key))}
        />
      </Sider>
      <Layout>
        <Header style={{ background: "#fff", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            YEHEY 宠物"在场" - 管理后台
          </Typography.Title>
          <Space>
            <Button
              icon={<SettingOutlined />}
              size="small"
              onClick={() => {
                setSettingsKeyInput(getAdminKey());
                setKeyModalOpen(true);
              }}
            >
              Admin Key
            </Button>
            <Button icon={<LogoutOutlined />} size="small" onClick={handleLogout}>
              退出登录
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Suspense fallback={<Card loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/schedules" element={<SchedulesPage />} />
              <Route path="/image-review" element={<ImageReviewPage />} />
              <Route path="/customization" element={<CustomizationPage />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/devices/:deviceType/:deviceId" element={<DevicesPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/ota/firmware" element={<OtaFirmwarePage />} />
              <Route path="/ota/internal" element={<OtaInternalPage />} />
              <Route path="/ota/registry" element={<OtaRegistryPage />} />
              <Route path="/ota/dispatch" element={<OtaDispatchPage />} />
              <Route path="/ota/tokens" element={<OtaTokensPage />} />
              <Route path="/pets" element={<PetsPage />} />
              <Route path="/collars" element={<CollarsPage />} />
              <Route path="/desktops" element={<DesktopsPage />} />
              <Route path="/events" element={<EventsPage />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>

      <Modal
        title="设置 Admin Key"
        open={keyModalOpen}
        onOk={handleSaveKey}
        onCancel={() => setKeyModalOpen(false)}
      >
        <Input.Password
          value={settingsKeyInput}
          onChange={(e) => setSettingsKeyInput(e.target.value)}
          placeholder="输入 Admin Key"
        />
      </Modal>
    </Layout>
  );
}
