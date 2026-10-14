import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';

export default function AdminReports() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    const fetchReport = async () => {
      const res = await api.get('/admin/reports');
      setReport(res.data);
    };
    fetchReport();
  }, []);

  const handleCsvDownload = async () => {
    const res = await api.get('/admin/reports/export-csv', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'trustflow-report.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (!report) return <div className="loading">Loading reports...</div>;

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Reports / Audit Logs" subtitle="AML activity analytics and audit evidence" />
        <div className="cards-grid">
          {Object.entries(report).filter(([key]) => key !== 'weeklyActivity').map(([key, value]) => (
            <div className="stat-card" key={key}><strong>{key}</strong><span>{String(value)}</span></div>
          ))}
        </div>
        <div className="panel full-width"><button className="btn primary" onClick={handleCsvDownload}>Export CSV</button></div>
      </main>
    </div>
  );
}
