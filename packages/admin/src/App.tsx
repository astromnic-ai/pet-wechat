import { useEffect, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Typography, Modal, Input, Button, Space, Card, Alert } from "antd";
import {
  UserOutlined,
  HeartOutlined,
  ApiOutlined,
  DesktopOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  SettingOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { getAdminKey, setAdminKey, verifyAdminKey } from "./api/client";
import Dashboard from "./pages/Dashboard";
import UsersPage from "./pages/Users";
import PetsPage from "./pages/Pets";
import CollarsPage from "./pages/Collars";
import DesktopsPage from "./pages/Desktops";
import EventsPage from "./pages/Events";
import PetModesPage from "./pages/PetModes";

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: "/", icon: <DashboardOutlined />, label: "概览" },
  { key: "/users", icon: <UserOutlined />, label: "用户" },
  { key: "/pets", icon: <HeartOutlined />, label: "宠物" },
  { key: "/pet-modes", icon: <ClockCircleOutlined />, label: "活动模式" },
  { key: "/collars", icon: <ApiOutlined />, label: "项圈" },
  { key: "/desktops", icon: <DesktopOutlined />, label: "桌面摆台" },
  { key: "/events", icon: <ThunderboltOutlined />, label: "模拟事件" },
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
          items={menuItems}
          onClick={({ key }) => navigate(key)}
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
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/pets" element={<PetsPage />} />
            <Route path="/pet-modes" element={<PetModesPage />} />
            <Route path="/collars" element={<CollarsPage />} />
            <Route path="/desktops" element={<DesktopsPage />} />
            <Route path="/events" element={<EventsPage />} />
          </Routes>
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
