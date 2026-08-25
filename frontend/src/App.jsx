import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import RequireRole from './components/RequireRole.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import POS from './pages/POS.jsx';
import Kitchen from './pages/Kitchen.jsx';
import Tables from './pages/Tables.jsx';
import Menu from './pages/Menu.jsx';
import Inventory from './pages/Inventory.jsx';
import Customers from './pages/Customers.jsx';
import Staff from './pages/Staff.jsx';
import Finance from './pages/Finance.jsx';
import Reports from './pages/Reports.jsx';
import FnbSales from './pages/FnbSales.jsx';
import ZReport from './pages/ZReport.jsx';
import Activity from './pages/Activity.jsx';
import FullReport from './pages/FullReport.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={
              <RequireRole roles={['owner', 'manager', 'finance']}><Dashboard /></RequireRole>
            } />
            <Route path="pos" element={
              <RequireRole roles={['owner', 'manager', 'cashier']}><POS /></RequireRole>
            } />
            <Route path="kitchen" element={
              <RequireRole roles={['owner', 'manager', 'chef', 'cashier']}><Kitchen /></RequireRole>
            } />
            <Route path="tables" element={
              <RequireRole roles={['owner', 'manager', 'cashier']}><Tables /></RequireRole>
            } />
            <Route path="menu" element={
              <RequireRole roles={['owner', 'manager']}><Menu /></RequireRole>
            } />
            <Route path="inventory" element={
              <RequireRole roles={['owner', 'manager', 'chef', 'storekeeper']}><Inventory /></RequireRole>
            } />
            <Route path="customers" element={
              <RequireRole roles={['owner', 'manager', 'cashier']}><Customers /></RequireRole>
            } />
            <Route path="staff" element={
              <RequireRole roles={['owner', 'manager']}><Staff /></RequireRole>
            } />
            <Route path="finance" element={
              <RequireRole roles={['owner', 'manager', 'finance']}><Finance /></RequireRole>
            } />
            <Route path="reports" element={
              <RequireRole roles={['owner', 'manager', 'finance']}><Reports /></RequireRole>
            } />
            <Route path="fnb" element={
              <RequireRole roles={['owner', 'manager', 'fnb']}><FnbSales /></RequireRole>
            } />
            <Route path="z-report" element={
              <RequireRole roles={['owner', 'manager']}><ZReport /></RequireRole>
            } />
            <Route path="activity" element={
              <RequireRole roles={['owner']}><Activity /></RequireRole>
            } />
            <Route path="full-report" element={
              <RequireRole roles={['owner']}><FullReport /></RequireRole>
            } />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
