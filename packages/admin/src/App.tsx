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
          selectedKeys={[location.pathname]}
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
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/users" element={<UsersPage />} />
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
