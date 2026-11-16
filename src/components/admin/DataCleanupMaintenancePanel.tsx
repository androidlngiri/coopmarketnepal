import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Eye,
  FileCheck2,
  HardDrive,
  History,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../lib/utils';
import { formatDateBS, toNepaliDigits } from '../../lib/bs-date';
import { Button } from '../ui/button';
import { Input, Select } from '../ui/input';
import { toast } from 'sonner';

type SubTab =
  | 'overview'
  | 'test_demo'
  | 'seed_data'
  | 'duplicates'
  | 'mock_audit'
  | 'preview'
  | 'backups'
  | 'history';

type RecordClassification =
  | 'confirmed_test'
  | 'seed_demo'
  | 'genuine_business'
  | 'system_config'
  | 'uncertain_review';

interface ScannedRecord {
  id: string;
  table: string;
  label: string;
  sublabel: string;
  cooperativeId: string | null;
  cooperativeName: string | null;
  createdAt: string | null;
  deletedAt: string | null;
  classification: RecordClassification;
  reasons: string[];
  deletable: boolean;
  softArchivable: boolean;
  relatedSummary: string;
  storageUrls: string[];
  rawPreview: Record<string, unknown>;
}

interface DuplicateGroup {
  key: string;
  table: string;
  duplicateType: string;
  value: string;
  classification: RecordClassification;
  records: Array<{
    id: string;
    label: string;
    cooperativeId: string | null;
    cooperativeName: string | null;
    createdAt: string | null;
    deletable: boolean;
    reasons: string[];
  }>;
}

interface ScanReport {
  scannedAt: string;
  classificationSummary: {
    confirmed_test: number;
    seed_demo: number;
    genuine_business: number;
    system_config: number;
    uncertain_review: number;
    duplicate_groups: number;
    orphaned_storage_files: number;
    total_storage_files: number;
  };
  tableCounts: Array<{
    table: string;
    count: number;
    testOrSeedCount: number;
    genuineCount: number;
    systemCount: number;
    uncertainCount: number;
  }>;
  records: ScannedRecord[];
  duplicates: DuplicateGroup[];
  storageFiles: Array<{
    bucket: string;
    path: string;
    size: number;
    createdAt: string | null;
    referenced: boolean;
  }>;
  codeAudit: Array<{
    id: string;
    area: string;
    file: string;
    issue: string;
    resolution: string;
    status: string;
  }>;
  filterOptions: {
    cooperatives: Array<{ id: string; name_en: string; name_ne: string; slug: string }>;
    tables: string[];
  };
}

interface PreviewPayload {
  mode: 'soft_archive' | 'permanent_delete';
  requestedCount: number;
  eligibleCount: number;
  blockedCount: number;
  eligible: Array<ScannedRecord & { impactCounts: Record<string, number> }>;
  blocked: Array<{
    table: string;
    id: string;
    label: string;
    classification: string;
    blockReason: string;
  }>;
  dependentSummary: Record<string, number>;
  storageImpact: Array<{
    url: string;
    bucket: string;
    path: string;
    safeToDelete: boolean;
    reason: string;
  }>;
  irreversibleWarning: string;
}

interface BackupRow {
  id: string;
  backup_label: string;
  category: string;
  mode: string;
  table_counts_json: Record<string, number>;
  record_count: number;
  checksum_sha256: string;
  created_by_name: string | null;
  restored_at: string | null;
  restore_notes: string | null;
  created_at: string;
}

interface AuditHistoryRow {
  id: string;
  admin_user_id: string | null;
  admin_name: string | null;
  admin_email: string | null;
  category: string;
  mode: string;
  reason: string;
  selected_ids_json: Array<{ table: string; id: string }>;
  deleted_count: number;
  retained_count: number;
  skipped_count: number;
  failed_count: number;
  backup_id: string | null;
  backup_label: string | null;
  backup_checksum: string | null;
  execution_status: string;
  details_json: Record<string, unknown>;
  created_at: string;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const CLASSIFICATION_STYLES: Record<
  RecordClassification,
  { ne: string; en: string; className: string }
> = {
  confirmed_test: {
    ne: 'पुष्टि गरिएको परीक्षण/डेमो',
    en: 'Confirmed Test/Demo',
    className: 'bg-red-50 text-[#B91C1C] border-red-200',
  },
  seed_demo: {
    ne: 'बीज (Seed) डेमो डाटा',
    en: 'Seeded Demo Data',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  genuine_business: {
    ne: 'वास्तविक व्यवसाय (सुरक्षित)',
    en: 'Genuine Business (Protected)',
    className: 'bg-emerald-50 text-[#15803D] border-emerald-200',
  },
  system_config: {
    ne: 'अनिवार्य प्रणाली सेटिङ (लक्ड)',
    en: 'System Config (Locked)',
    className: 'bg-slate-100 text-[#0F172A] border-slate-300',
  },
  uncertain_review: {
    ne: 'समीक्षा आवश्यक (अनिश्चित)',
    en: 'Uncertain — Manual Review',
    className: 'bg-orange-50 text-orange-800 border-orange-200',
  },
};

export function DataCleanupMaintenancePanel() {
  const { lang } = useApp();
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [loading, setLoading] = useState(false);
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [history, setHistory] = useState<AuditHistoryRow[]>([]);

  // Selection map keyed by `${table}:${id}`
  const [selectedKeys, setSelectedKeys] = useState<Record<string, { table: string; id: string }>>({});

  // Filters
  const [searchText, setSearchText] = useState('');
  const [tableFilter, setTableFilter] = useState('all');
  const [classFilter, setClassFilter] = useState<'all' | RecordClassification>('all');
  const [coopFilter, setCoopFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Preview & Execution state
  const [cleanupMode, setCleanupMode] = useState<'soft_archive' | 'permanent_delete'>('soft_archive');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Inspect record modal
  const [inspectRecord, setInspectRecord] = useState<ScannedRecord | null>(null);
  const [inspectHistory, setInspectHistory] = useState<AuditHistoryRow | null>(null);

  // Password Re-Auth Modal for Execute Cleanup
  const [execModalOpen, setExecModalOpen] = useState(false);
  const [execCategory, setExecCategory] = useState('test_demo_cleanup');
  const [execReason, setExecReason] = useState('');
  const [execPhrase, setExecPhrase] = useState('');
  const [execPassword, setExecPassword] = useState('');
  const [executing, setExecuting] = useState(false);

  // Password Re-Auth Modal for Restore Backup
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreReason, setRestoreReason] = useState('Super Admin recovery from verified backup');
  const [restoring, setRestoring] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [scanRes, bkRes, histRes] = await Promise.all([
        apiFetch<ScanReport>('/api/admin/maintenance/scan'),
        apiFetch<{ backups: BackupRow[] }>('/api/admin/maintenance/backups'),
        apiFetch<{ history: AuditHistoryRow[] }>('/api/admin/maintenance/history'),
      ]);
      if (scanRes.ok) setScan(scanRes.data);
      else toast.error(scanRes.error || 'Failed to scan database');
      if (bkRes.ok) setBackups(bkRes.data.backups || []);
      if (histRes.ok) setHistory(histRes.data.history || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const selectedList = useMemo(() => Object.values(selectedKeys), [selectedKeys]);

  const toggleSelect = (rec: { table: string; id: string; classification: RecordClassification; softArchivable: boolean; deletable: boolean }) => {
    if (rec.classification === 'system_config' || rec.classification === 'genuine_business' || rec.classification === 'uncertain_review') {
      toast.warning(
        lang === 'ne'
          ? 'सुरक्षित वास्तविक, प्रणाली वा समीक्षा-आवश्यक रेकर्ड बल्क सफाईको लागि छान्न मिल्दैन।'
          : 'Genuine business, essential system config, and uncertain records are protected from bulk cleanup.'
      );
      return;
    }
    const key = `${rec.table}:${rec.id}`;
    setSelectedKeys((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { table: rec.table, id: rec.id };
      return next;
    });
  };

  const filteredRecords = useMemo(() => {
    if (!scan) return [];
    const q = searchText.trim().toLowerCase();
    return scan.records.filter((r) => {
      if (tableFilter !== 'all' && r.table !== tableFilter) return false;
      if (classFilter !== 'all' && r.classification !== classFilter) return false;
      if (coopFilter !== 'all' && r.cooperativeId !== coopFilter) return false;
      if (dateFrom && r.createdAt && r.createdAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && r.createdAt && r.createdAt.slice(0, 10) > dateTo) return false;
      if (q) {
        const hay = `${r.id} ${r.table} ${r.label} ${r.sublabel} ${r.cooperativeName || ''} ${r.reasons.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scan, tableFilter, classFilter, coopFilter, dateFrom, dateTo, searchText]);

  const seedDemoRecords = useMemo(
    () => (scan?.records || []).filter((r) => r.classification === 'seed_demo'),
    [scan]
  );

  const systemSeedRecords = useMemo(
    () => (scan?.records || []).filter((r) => r.classification === 'system_config'),
    [scan]
  );

  const runPreview = async (
    customTargets?: Array<{ table: string; id: string }>,
    modeOverride?: 'soft_archive' | 'permanent_delete',
    categoryHint?: string
  ) => {
    const targets = customTargets || selectedList;
    const mode = modeOverride || cleanupMode;
    if (targets.length === 0) {
      toast.error(lang === 'ne' ? 'कृपया कम्तीमा १ रेकर्ड छान्नुहोस्।' : 'Select at least one record to preview.');
      return;
    }
    setPreviewLoading(true);
    setCleanupMode(mode);
    if (categoryHint) setExecCategory(categoryHint);
    try {
      const res = await apiFetch<PreviewPayload>('/api/admin/maintenance/preview', {
        method: 'POST',
        body: JSON.stringify({ targets, mode }),
      });
      if (!res.ok) {
        toast.error(res.error || 'Preview failed');
        return;
      }
      setPreview(res.data);
      setSubTab('preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateManualBackup = async () => {
    if (selectedList.length === 0) {
      toast.error(lang === 'ne' ? 'ब्याकअप गर्न रेकर्ड छान्नुहोस्।' : 'Select records first to create a backup snapshot.');
      return;
    }
    setCreatingBackup(true);
    try {
      const res = await apiFetch<{ backup: BackupRow }>('/api/admin/maintenance/backup', {
        method: 'POST',
        body: JSON.stringify({
          targets: selectedList,
          category: 'manual_snapshot',
          backupLabel: `Super Admin Snapshot (${selectedList.length} targets)`,
        }),
      });
      if (!res.ok) {
        toast.error(res.error || 'Failed to create backup');
        return;
      }
      toast.success(
        lang === 'ne'
          ? `प्रमाणित ब्याकअप सुरक्षित भयो (${res.data.backup.record_count} रेकर्ड)।`
          : `Verified backup created (${res.data.backup.record_count} records).`
      );
      await loadAll();
      setSubTab('backups');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleExecuteCleanup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview || preview.eligibleCount === 0) return;
    setExecuting(true);
    try {
      const targets = preview.eligible.map((item) => ({ table: item.table, id: item.id }));
      const res = await apiFetch<{
        status: string;
        backupId: string;
        deletedCount: number;
        retainedCount: number;
        skippedCount: number;
        failedCount: number;
        storageDeletedCount: number;
        storageRetainedCount: number;
        errors: string[];
      }>('/api/admin/maintenance/execute', {
        method: 'POST',
        body: JSON.stringify({
          targets,
          mode: cleanupMode,
          category: execCategory,
          reason: execReason,
          confirmPhrase: execPhrase,
          password: execPassword,
        }),
      });
      if (!res.ok) {
        toast.error(res.error || 'Cleanup execution failed');
        return;
      }
      toast.success(
        lang === 'ne'
          ? `सफाई सम्पन्न: ${res.data.deletedCount} हटाइयो/आर्काइभ, ${res.data.retainedCount} सुरक्षित राखियो, ${res.data.failedCount} असफल।`
          : `Cleanup ${res.data.status}: ${res.data.deletedCount} cleaned, ${res.data.retainedCount} retained, ${res.data.failedCount} failed.`
      );
      setExecModalOpen(false);
      setExecPassword('');
      setExecPhrase('');
      setExecReason('');
      setSelectedKeys({});
      setPreview(null);
      await loadAll();
      setSubTab('history');
    } finally {
      setExecuting(false);
    }
  };

  const handleRestoreBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const res = await apiFetch<{ ok: boolean; restoredCount: number; skippedCount: number }>(
        `/api/admin/maintenance/backups/${restoreTarget.id}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({
            password: restorePassword,
            reason: restoreReason,
          }),
        }
      );
      if (!res.ok) {
        toast.error(res.error || 'Restore failed');
        return;
      }
      toast.success(
        lang === 'ne'
          ? `ब्याकअप पुनःस्थापना सफल: ${res.data.restoredCount} रेकर्ड पुनर्स्थापित (${res.data.skippedCount} छोडिए)।`
          : `Backup restored: ${res.data.restoredCount} records restored (${res.data.skippedCount} skipped).`
      );
      setRestoreTarget(null);
      setRestorePassword('');
      await loadAll();
    } finally {
      setRestoring(false);
    }
  };

  const subNav: Array<{ id: SubTab; ne: string; en: string; icon: React.ReactNode }> = [
    { id: 'overview', ne: 'डाटा अवलोकन', en: 'Data Overview', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'test_demo', ne: 'परीक्षण र डेमो डाटा', en: 'Test & Demo Data', icon: <Trash2 className="w-3.5 h-3.5" /> },
    { id: 'seed_data', ne: 'बीज (Seed) डाटा', en: 'Seed Data Management', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'duplicates', ne: 'डुप्लिकेट रेकर्ड', en: 'Duplicate Records', icon: <Copy className="w-3.5 h-3.5" /> },
    { id: 'mock_audit', ne: 'हार्डकोड / मोक अडिट', en: 'Hardcoded / Mock Audit', icon: <FileCheck2 className="w-3.5 h-3.5" /> },
    { id: 'preview', ne: `सफाई पूर्वावलोकन (${selectedList.length})`, en: `Cleanup Preview (${selectedList.length})`, icon: <Eye className="w-3.5 h-3.5" /> },
    { id: 'backups', ne: 'ब्याकअप र पुनर्स्थापना', en: 'Backup & Recovery', icon: <HardDrive className="w-3.5 h-3.5" /> },
    { id: 'history', ne: 'सफाई इतिहास (Audit)', en: 'Cleanup History', icon: <History className="w-3.5 h-3.5" /> },
  ];

  const sum = scan?.classificationSummary;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B91C1C]">
            {lang === 'ne' ? 'प्रणाली मर्मत र सुरक्षा' : 'System Maintenance → Data Cleanup & Maintenance'}
          </p>
          <h2 className="font-display text-xl font-bold text-[#0F172A]">
            {lang === 'ne'
              ? 'डाटा सफाई, नक्कल पहिचान, ब्याकअप र पुनर्स्थापना केन्द्र'
              : 'Data Cleanup, Duplicate Audit, Backup & Recovery Center'}
          </h2>
          <p className="text-xs text-[#57534E] mt-0.5">
            {lang === 'ne'
              ? 'वास्तविक व्यापारिक डाटा, सक्रिय सदस्यता र प्रणाली सेटिङ पूर्ण रूपमा सुरक्षित राखी केवल प्रमाणित परीक्षण/अस्थायी डाटा मात्र सफाई गर्नुहोस्।'
              : 'Multi-signal classification protects genuine business records & system configuration while safely archiving or cleaning confirmed test/demo records.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedList.length > 0 && (
            <>
              <Button size="sm" variant="outline" disabled={creatingBackup} onClick={handleCreateManualBackup}>
                <HardDrive className="w-3.5 h-3.5 mr-1" />
                {creatingBackup
                  ? '...'
                  : lang === 'ne'
                  ? `ब्याकअप (${toNepaliDigits(selectedList.length)})`
                  : `Snapshot (${selectedList.length})`}
              </Button>
              <Button size="sm" onClick={() => runPreview(selectedList, cleanupMode)}>
                <Eye className="w-3.5 h-3.5 mr-1" />
                {lang === 'ne'
                  ? `पूर्वावलोकन (${toNepaliDigits(selectedList.length)})`
                  : `Preview Cleanup (${selectedList.length})`}
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" disabled={loading} onClick={loadAll}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {lang === 'ne' ? 'पुनः स्क्यान' : 'Rescan DB'}
          </Button>
        </div>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex flex-wrap gap-1.5 bg-white border border-[#E5E2DC] rounded-xl p-2">
        {subNav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubTab(item.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              subTab === item.id ? 'bg-[#0F172A] text-white' : 'text-[#57534E] hover:bg-[#F3F1EC]'
            }`}
          >
            {item.icon}
            <span>{lang === 'ne' ? item.ne : item.en}</span>
          </button>
        ))}
      </div>

      {/* 1. DATA OVERVIEW */}
      {subTab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
              <p className="text-[11px] text-[#78716C]">
                {lang === 'ne' ? 'पुष्टि गरिएको परीक्षण डाटा' : 'Confirmed Test Data'}
              </p>
              <p className="text-2xl font-bold text-[#B91C1C] tabular-nums mt-1">
                {lang === 'ne' ? toNepaliDigits(sum?.confirmed_test || 0) : sum?.confirmed_test || 0}
              </p>
              <button
                type="button"
                onClick={() => {
                  setClassFilter('confirmed_test');
                  setSubTab('test_demo');
                }}
                className="text-[11px] text-[#B91C1C] hover:underline mt-1 cursor-pointer"
              >
                {lang === 'ne' ? 'हेर्नुहोस् →' : 'Inspect →'}
              </button>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
              <p className="text-[11px] text-[#78716C]">{lang === 'ne' ? 'बीज (Seed) डेमो डाटा' : 'Seeded Demo Records'}</p>
              <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
                {lang === 'ne' ? toNepaliDigits(sum?.seed_demo || 0) : sum?.seed_demo || 0}
              </p>
              <button
                type="button"
                onClick={() => setSubTab('seed_data')}
                className="text-[11px] text-amber-800 hover:underline mt-1 cursor-pointer"
              >
                {lang === 'ne' ? 'बीज व्यवस्थापन →' : 'Manage Seeds →'}
              </button>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
              <p className="text-[11px] text-[#78716C]">
                {lang === 'ne' ? 'वास्तविक व्यवसाय (सुरक्षित)' : 'Genuine Business (Protected)'}
              </p>
              <p className="text-2xl font-bold text-[#15803D] tabular-nums mt-1">
                {lang === 'ne' ? toNepaliDigits(sum?.genuine_business || 0) : sum?.genuine_business || 0}
              </p>
              <p className="text-[11px] text-[#78716C] mt-1">
                {lang === 'ne' ? 'सिस्टम सेटिङ:' : 'System Config:'}{' '}
                {lang === 'ne' ? toNepaliDigits(sum?.system_config || 0) : sum?.system_config || 0}
              </p>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
              <p className="text-[11px] text-[#78716C]">
                {lang === 'ne' ? 'समीक्षा आवश्यक / डुप्लिकेट' : 'Uncertain / Duplicates'}
              </p>
              <p className="text-2xl font-bold text-orange-700 tabular-nums mt-1">
                {lang === 'ne'
                  ? `${toNepaliDigits(sum?.uncertain_review || 0)} / ${toNepaliDigits(sum?.duplicate_groups || 0)}`
                  : `${sum?.uncertain_review || 0} / ${sum?.duplicate_groups || 0}`}
              </p>
              <button
                type="button"
                onClick={() => setSubTab('duplicates')}
                className="text-[11px] text-orange-800 hover:underline mt-1 cursor-pointer"
              >
                {lang === 'ne' ? 'डुप्लिकेट जाँच →' : 'Review Duplicates →'}
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E5E2DC] flex items-center justify-between">
              <h3 className="font-semibold text-sm text-[#0F172A]">
                {lang === 'ne' ? 'सबै Supabase तालिकाहरूको वर्गीकरण सारांश' : 'All Supabase Tables Classification Summary'}
              </h3>
              <span className="text-[11px] text-[#78716C]">
                Storage objects: {sum?.total_storage_files || 0} (Orphaned: {sum?.orphaned_storage_files || 0})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#FAF9F6] text-[#57534E] border-b border-[#E5E2DC]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Table</th>
                    <th className="text-right px-4 py-2.5 font-medium">Total Rows</th>
                    <th className="text-right px-4 py-2.5 font-medium">Test / Seed</th>
                    <th className="text-right px-4 py-2.5 font-medium">Genuine</th>
                    <th className="text-right px-4 py-2.5 font-medium">System</th>
                    <th className="text-right px-4 py-2.5 font-medium">Uncertain</th>
                    <th className="text-right px-4 py-2.5 font-medium">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F1EC]">
                  {(scan?.tableCounts || []).map((row) => (
                    <tr key={row.table} className="hover:bg-[#FAF9F6]">
                      <td className="px-4 py-2 font-mono text-[#0F172A]">{row.table}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">{row.count}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#B91C1C]">{row.testOrSeedCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#15803D]">{row.genuineCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#57534E]">{row.systemCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-orange-700">{row.uncertainCount}</td>
                      <td className="px-4 py-2 text-right">
                        {scan?.filterOptions.tables.includes(row.table) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setTableFilter(row.table);
                              setClassFilter('all');
                              setSubTab('test_demo');
                            }}
                            className="text-[#B91C1C] hover:underline cursor-pointer"
                          >
                            {lang === 'ne' ? 'खोल्नुहोस्' : 'Inspect'}
                          </button>
                        ) : (
                          <span className="text-[#A8A29E]">Child/Audit</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. TEST & DEMO DATA */}
      {subTab === 'test_demo' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <div className="relative lg:col-span-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#78716C]" />
                <Input
                  placeholder={lang === 'ne' ? 'नाम, ID, SKU, फोन वा कारण खोज्नुहोस्...' : 'Search ID, name, phone, reason...'}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-8 text-xs"
                />
              </div>
              <Select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="text-xs">
                <option value="all">{lang === 'ne' ? 'सबै तालिका' : 'All Tables'}</option>
                {(scan?.filterOptions.tables || []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value as 'all' | RecordClassification)}
                className="text-xs"
              >
                <option value="all">{lang === 'ne' ? 'सबै वर्गीकरण' : 'All Classifications'}</option>
                <option value="confirmed_test">Confirmed Test/Demo</option>
                <option value="seed_demo">Seeded Demo Data</option>
                <option value="uncertain_review">Uncertain (Manual Review)</option>
                <option value="genuine_business">Genuine Business (Protected)</option>
                <option value="system_config">System Config (Locked)</option>
              </Select>
              <Select value={coopFilter} onChange={(e) => setCoopFilter(e.target.value)} className="text-xs">
                <option value="all">{lang === 'ne' ? 'सबै सहकारी' : 'All Cooperatives'}</option>
                {(scan?.filterOptions.cooperatives || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === 'ne' ? c.name_ne : c.name_en}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F3F1EC] text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[#78716C]">Date range:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-[#E5E2DC] rounded px-2 py-1 text-xs"
                />
                <span>–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border border-[#E5E2DC] rounded px-2 py-1 text-xs"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSearchText('');
                    setTableFilter('all');
                    setClassFilter('all');
                    setCoopFilter('all');
                    setDateFrom('');
                    setDateTo('');
                  }}
                >
                  Reset Filters
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = { ...selectedKeys };
                    let count = 0;
                    for (const r of filteredRecords) {
                      if (r.classification === 'confirmed_test') {
                        next[`${r.table}:${r.id}`] = { table: r.table, id: r.id };
                        count++;
                      }
                    }
                    setSelectedKeys(next);
                    toast.info(lang === 'ne' ? `${count} पुष्टि परीक्षण रेकर्ड छानिए।` : `Selected ${count} confirmed test records in filter.`);
                  }}
                >
                  Select Confirmed Test ({filteredRecords.filter((r) => r.classification === 'confirmed_test').length})
                </Button>
                {selectedList.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelectedKeys({})}>
                    Clear ({selectedList.length})
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {filteredRecords.length === 0 ? (
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-8 text-center text-xs text-[#78716C]">
                {lang === 'ne' ? 'फिल्टर अनुसार कुनै रेकर्ड भेटिएन।' : 'No matching records found.'}
              </div>
            ) : (
              filteredRecords.map((rec) => {
                const key = `${rec.table}:${rec.id}`;
                const checked = Boolean(selectedKeys[key]);
                const badge = CLASSIFICATION_STYLES[rec.classification];
                const isProtected =
                  rec.classification === 'genuine_business' ||
                  rec.classification === 'system_config' ||
                  rec.classification === 'uncertain_review';

                return (
                  <div
                    key={key}
                    className={`bg-white border rounded-xl p-4 flex flex-wrap items-start justify-between gap-3 ${
                      checked ? 'border-[#B91C1C] bg-red-50/20' : 'border-[#E5E2DC]'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isProtected}
                        onChange={() => toggleSelect(rec)}
                        className="mt-1 h-4 w-4 accent-[#B91C1C] disabled:opacity-40 cursor-pointer"
                        aria-label={`Select ${rec.label}`}
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#F3F1EC] text-[#0F172A]">
                            {rec.table}
                          </span>
                          <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${badge.className}`}>
                            {lang === 'ne' ? badge.ne : badge.en}
                          </span>
                          {rec.deletedAt && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                              Soft-Archived
                            </span>
                          )}
                          {isProtected && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#57534E]">
                              <Lock className="w-3 h-3" /> Protected
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-sm text-[#0F172A] break-words">{rec.label}</p>
                        <p className="text-xs text-[#57534E]">
                          ID: <span className="font-mono">{rec.id}</span> · {rec.sublabel}
                        </p>
                        <p className="text-[11px] text-[#78716C]">
                          {rec.cooperativeName ? `Coop: ${rec.cooperativeName} · ` : ''}
                          {rec.createdAt ? `Created: ${formatDateBS(rec.createdAt, lang)} · ` : ''}
                          Related: {rec.relatedSummary}
                        </p>
                        <ul className="text-[11px] text-[#57534E] list-disc pl-4">
                          {rec.reasons.map((rs, idx) => (
                            <li key={idx}>{rs}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setInspectRecord(rec)}>
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        {lang === 'ne' ? 'विवरण' : 'Inspect'}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. SEED DATA MANAGEMENT */}
      {subTab === 'seed_data' && (
        <div className="space-y-5">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm text-[#0F172A]">
                  {lang === 'ne' ? 'अस्थायी डेमो बीज डाटा (Demo Seed Cooperatives & Catalog)' : 'Demo Storefront & Catalog Seed Data'}
                </h3>
                <p className="text-xs text-[#57534E]">
                  {lang === 'ne'
                    ? 'यिनीहरू प्रारम्भिक डेमो पसल (Ilam Tea, Jumla Organics आदि) हुन्। आवश्यकता अनुसार अस्थायी रूपमा लुकाउन (Soft-Archive) वा ब्याकअपसहित हटाउन सकिन्छ।'
                    : 'Initial demo storefronts, seed accounts, and demo catalog items. Can be selectively archived or safely deleted with mandatory backup.'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = { ...selectedKeys };
                    for (const r of seedDemoRecords) {
                      next[`${r.table}:${r.id}`] = { table: r.table, id: r.id };
                    }
                    setSelectedKeys(next);
                    toast.info(`${seedDemoRecords.length} seed demo records selected`);
                  }}
                >
                  Select All Demo Seeds ({seedDemoRecords.length})
                </Button>
                <Button
                  size="sm"
                  disabled={seedDemoRecords.length === 0}
                  onClick={() =>
                    runPreview(
                      seedDemoRecords.map((r) => ({ table: r.table, id: r.id })),
                      'soft_archive',
                      'seed_demo_cleanup'
                    )
                  }
                >
                  <Archive className="w-3.5 h-3.5 mr-1" />
                  Preview Soft-Archive Demo Seeds
                </Button>
              </div>
            </div>

            <div className="divide-y divide-[#F3F1EC] text-xs">
              {seedDemoRecords.length === 0 ? (
                <p className="py-6 text-center text-[#78716C]">No demo seed records present in database.</p>
              ) : (
                seedDemoRecords.map((r) => {
                  const key = `${r.table}:${r.id}`;
                  return (
                    <div key={key} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedKeys[key])}
                          onChange={() => toggleSelect(r)}
                          className="mt-1 h-4 w-4 accent-[#B91C1C]"
                        />
                        <div>
                          <p className="font-semibold text-[#0F172A]">
                            <span className="font-mono text-[11px] bg-[#F3F1EC] px-1.5 py-0.5 rounded mr-1.5">{r.table}</span>
                            {r.label}
                          </p>
                          <p className="text-[#57534E]">{r.sublabel} · {r.reasons.join(' · ')}</p>
                        </div>
                      </label>
                      <Button size="sm" variant="ghost" onClick={() => setInspectRecord(r)}>
                        Inspect
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
              <ShieldCheck className="w-4 h-4 text-[#15803D]" />
              <span>
                {lang === 'ne'
                  ? 'अनिवार्य प्रणाली र कन्फिगरेसन बीज डाटा (मेटाउन नपाइने)'
                  : 'Essential System & Configuration Seeds (Strictly Protected)'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {systemSeedRecords.map((r) => (
                <div key={`${r.table}:${r.id}`} className="border border-[#E5E2DC] rounded-lg p-3 bg-[#FAF9F6] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-[#0F172A] truncate">
                      <span className="font-mono text-[10px] text-[#78716C] mr-1">{r.table}</span>· {r.label}
                    </p>
                    <p className="text-[11px] text-[#57534E] truncate">{r.reasons[0]}</p>
                  </div>
                  <Lock className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. DUPLICATE RECORDS */}
      {subTab === 'duplicates' && (
        <div className="space-y-4">
          {!scan?.duplicates || scan.duplicates.length === 0 ? (
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-[#15803D]" />
              <p className="text-sm font-semibold text-[#0F172A]">
                {lang === 'ne' ? 'कुनै डुप्लिकेट रेकर्ड फेला परेन।' : 'No Duplicate Records Detected'}
              </p>
              <p className="text-xs text-[#57534E]">
                Phones, emails, cooperative names, product SKUs, and order fingerprints are currently unique.
              </p>
            </div>
          ) : (
            scan.duplicates.map((grp) => (
              <div key={grp.key} className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#F3F1EC] mr-2">
                      {grp.table} · {grp.duplicateType}
                    </span>
                    <strong className="text-sm text-[#0F172A]">{grp.value}</strong>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded border ${CLASSIFICATION_STYLES[grp.classification].className}`}>
                    {lang === 'ne' ? CLASSIFICATION_STYLES[grp.classification].ne : CLASSIFICATION_STYLES[grp.classification].en}
                  </span>
                </div>

                <div className="divide-y divide-[#F3F1EC] text-xs">
                  {grp.records.map((item) => {
                    const key = `${grp.table}:${item.id}`;
                    return (
                      <div key={key} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={!item.deletable}
                            checked={Boolean(selectedKeys[key])}
                            onChange={() =>
                              toggleSelect({
                                table: grp.table,
                                id: item.id,
                                classification: item.deletable ? 'confirmed_test' : 'uncertain_review',
                                softArchivable: grp.table === 'cooperatives' || grp.table === 'products',
                                deletable: item.deletable,
                              })
                            }
                            className="mt-0.5 h-4 w-4 accent-[#B91C1C]"
                          />
                          <div>
                            <p className="font-semibold text-[#0F172A]">{item.label}</p>
                            <p className="text-[#57534E]">
                              ID: <span className="font-mono">{item.id}</span>
                              {item.cooperativeName ? ` · Coop: ${item.cooperativeName}` : ''}
                              {item.createdAt ? ` · ${formatDateBS(item.createdAt, lang)}` : ''}
                            </p>
                            <p className="text-[11px] text-[#78716C]">{item.reasons.join(' · ')}</p>
                          </div>
                        </label>
                        {!item.deletable && (
                          <span className="text-[11px] text-[#57534E] inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Primary / Protected
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 5. HARDCODED / MOCK DATA AUDIT */}
      {subTab === 'mock_audit' && (
        <div className="space-y-5">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-sm text-[#0F172A]">
                {lang === 'ne' ? 'फ्रन्टएन्ड र ब्याकएन्ड स्रोत कोड मोक-डाटा अडिट' : 'Source Code Hardcoded & Mock Data Audit'}
              </h3>
              <p className="text-xs text-[#57534E]">
                {lang === 'ne'
                  ? 'सबै ड्यासबोर्ड तथ्याङ्क, उत्पादन कार्ड, कानूनी पृष्ठ र API प्रतिक्रियाहरू वास्तविक Supabase डाटाबेस र इन्टिग्रेसनसँग जोडिएको सुनिश्चित गरियो।'
                  : 'Verified codebase audit of hardcoded stats, image fallbacks, static CMS routes, and soft-archive filtering.'}
              </p>
            </div>
            <div className="divide-y divide-[#F3F1EC] text-xs">
              {(scan?.codeAudit || []).map((item) => (
                <div key={item.id} className="py-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm text-[#0F172A]">{item.area}</strong>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-[#15803D] border border-emerald-200 font-medium">
                      {item.status === 'resolved' ? 'Resolved in Source Code' : 'Verified Live Query'}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-[#78716C]">{item.file}</p>
                  <p className="text-[#57534E]"><strong>Finding:</strong> {item.issue}</p>
                  <p className="text-[#15803D]"><strong>Action:</strong> {item.resolution}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-sm text-[#0F172A]">
              {lang === 'ne' ? 'Supabase Storage फाइल र अनाथ (Orphan) जाँच' : 'Supabase Storage Reference Integrity'}
            </h3>
            {!scan?.storageFiles || scan.storageFiles.length === 0 ? (
              <p className="text-xs text-[#78716C]">No uploaded files found in Supabase Storage buckets.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#FAF9F6] border-b border-[#E5E2DC] text-[#57534E]">
                    <tr>
                      <th className="text-left px-3 py-2">Bucket</th>
                      <th className="text-left px-3 py-2">Object Path</th>
                      <th className="text-right px-3 py-2">Bytes</th>
                      <th className="text-right px-3 py-2">DB Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F1EC]">
                    {scan.storageFiles.map((f) => (
                      <tr key={`${f.bucket}/${f.path}`}>
                        <td className="px-3 py-2 font-mono">{f.bucket}</td>
                        <td className="px-3 py-2 font-mono truncate max-w-xs">{f.path}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.size}</td>
                        <td className="px-3 py-2 text-right">
                          {f.referenced ? (
                            <span className="text-[#15803D] font-medium">Referenced</span>
                          ) : (
                            <span className="text-amber-700 font-medium">Orphaned</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. CLEANUP PREVIEW */}
      {subTab === 'preview' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-semibold text-sm text-[#0F172A]">
                {lang === 'ne' ? 'सफाई पूर्वावलोकन र प्रभाव मूल्याङ्कन' : 'Pre-Execution Impact & Safety Preview'}
              </h3>
              <p className="text-xs text-[#57534E]">
                {lang === 'ne'
                  ? `छानिएका रेकर्ड: ${toNepaliDigits(selectedList.length)} · मोड छान्नुहोस् र ब्याकअप सहित पुष्टि गर्नुहोस्।`
                  : `Selected Targets: ${selectedList.length} · Choose Soft-Archive (recoverable) or Permanent Delete (verified backup created automatically).`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={cleanupMode}
                onChange={(e) => {
                  const nextMode = e.target.value as 'soft_archive' | 'permanent_delete';
                  setCleanupMode(nextMode);
                  if (selectedList.length > 0) runPreview(selectedList, nextMode);
                }}
                className="text-xs w-48"
              >
                <option value="soft_archive">Soft-Archive (Recoverable)</option>
                <option value="permanent_delete">Permanent Delete (With Backup)</option>
              </Select>
              <Button size="sm" variant="outline" disabled={previewLoading || selectedList.length === 0} onClick={() => runPreview()}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${previewLoading ? 'animate-spin' : ''}`} />
                Run Preview
              </Button>
              {preview && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadBlob(
                      `cleanup-preview-${new Date().toISOString().slice(0, 10)}.json`,
                      JSON.stringify(preview, null, 2),
                      'application/json'
                    )
                  }
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Download Report
                </Button>
              )}
            </div>
          </div>

          {!preview ? (
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-10 text-center text-xs text-[#78716C] space-y-2">
              <Eye className="w-8 h-8 mx-auto opacity-40" />
              <p>
                {selectedList.length === 0
                  ? 'Select records from Test & Demo Data, Seed Data, or Duplicates to preview cleanup impact.'
                  : 'Click "Run Preview" above to analyze FK dependencies, protected records, and storage files.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className={`border rounded-xl p-4 flex items-start gap-3 text-xs ${
                  preview.mode === 'permanent_delete'
                    ? 'bg-red-50 border-red-200 text-[#B91C1C]'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">{preview.irreversibleWarning}</p>
                  <p>
                    Eligible for cleanup: <strong>{preview.eligibleCount}</strong> · Blocked/Retained:{' '}
                    <strong>{preview.blockedCount}</strong> · Affected Storage Files:{' '}
                    <strong>{preview.storageImpact.length}</strong>
                  </p>
                </div>
              </div>

              {Object.keys(preview.dependentSummary).length > 0 && (
                <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 text-xs space-y-2">
                  <p className="font-semibold text-[#0F172A]">Dependent Child Records Impacted:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(preview.dependentSummary).map(([tbl, cnt]) => (
                      <span key={tbl} className="px-2.5 py-1 rounded bg-[#FAF9F6] border border-[#E5E2DC] font-mono">
                        {tbl}: <strong>{cnt}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {preview.storageImpact.length > 0 && (
                <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 text-xs space-y-2">
                  <p className="font-semibold text-[#0F172A]">Affected Supabase Storage Objects:</p>
                  {preview.storageImpact.map((st) => (
                    <div key={`${st.bucket}/${st.path}`} className="flex justify-between gap-2 py-1 border-b border-[#F3F1EC]">
                      <span className="font-mono">{st.bucket}/{st.path}</span>
                      <span className={st.safeToDelete ? 'text-[#B91C1C]' : 'text-[#15803D]'}>{st.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {preview.blocked.length > 0 && (
                <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 text-xs space-y-2">
                  <p className="font-semibold text-[#15803D] flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" /> Retained / Protected Records ({preview.blocked.length})
                  </p>
                  <div className="divide-y divide-[#F3F1EC]">
                    {preview.blocked.map((b) => (
                      <div key={`${b.table}:${b.id}`} className="py-2 flex flex-wrap justify-between gap-2">
                        <span>
                          <span className="font-mono bg-[#F3F1EC] px-1.5 py-0.5 rounded mr-1">{b.table}</span>
                          <strong>{b.label}</strong>
                        </span>
                        <span className="text-[#57534E]">{b.blockReason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 text-xs space-y-2">
                <p className="font-semibold text-[#0F172A]">Eligible Targets ({preview.eligible.length})</p>
                {preview.eligible.length === 0 ? (
                  <p className="text-[#78716C]">No eligible records remain after mandatory safety guards.</p>
                ) : (
                  <div className="divide-y divide-[#F3F1EC]">
                    {preview.eligible.map((item) => (
                      <div key={`${item.table}:${item.id}`} className="py-2 flex flex-wrap justify-between gap-2">
                        <div>
                          <span className="font-mono bg-[#F3F1EC] px-1.5 py-0.5 rounded mr-1.5">{item.table}</span>
                          <strong>{item.label}</strong>
                          <p className="text-[11px] text-[#78716C]">{item.reasons.join(' · ')}</p>
                        </div>
                        {Object.keys(item.impactCounts).length > 0 && (
                          <span className="font-mono text-[11px] text-[#57534E]">
                            Children: {Object.entries(item.impactCounts).map(([k, v]) => `${k}=${v}`).join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {preview.eligibleCount > 0 && (
                  <div className="pt-3 flex justify-end gap-2">
                    <Button
                      variant={cleanupMode === 'permanent_delete' ? 'destructive' : 'default'}
                      onClick={() => setExecModalOpen(true)}
                    >
                      <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                      {cleanupMode === 'permanent_delete'
                        ? lang === 'ne'
                          ? 'ब्याकअप र पासवर्ड प्रमाणीकरण सहित मेटाउनुहोस्'
                          : 'Execute Permanent Cleanup (Password Required)'
                        : lang === 'ne'
                        ? 'सफ्ट-आर्काइभ कार्यान्वयन गर्नुहोस्'
                        : 'Execute Soft-Archive (Password Required)'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. BACKUP & RECOVERY */}
      {subTab === 'backups' && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm text-[#0F172A]">
                {lang === 'ne' ? 'प्रमाणित डाटा ब्याकअप र पुनर्स्थापना' : 'Verified Backup Snapshots & Recovery'}
              </h3>
              <p className="text-xs text-[#57534E]">
                Every bulk cleanup automatically verifies a SHA-256 JSON snapshot in PostgreSQL before any row is touched.
              </p>
            </div>
          </div>

          {backups.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#78716C]">No backup snapshots created yet.</p>
          ) : (
            <div className="divide-y divide-[#F3F1EC] text-xs">
              {backups.map((b) => (
                <div key={b.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-[#0F172A]">{b.backup_label}</strong>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#F3F1EC]">{b.mode}</span>
                      {b.restored_at && (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-[#15803D] border border-emerald-200 font-medium">
                          Restored {formatDateBS(b.restored_at, lang)}
                        </span>
                      )}
                    </div>
                    <p className="text-[#57534E]">
                      Records: <strong>{b.record_count}</strong> · SHA-256:{' '}
                      <span className="font-mono">{b.checksum_sha256.slice(0, 16)}…</span> · By:{' '}
                      {b.created_by_name || 'Super Admin'} · {formatDateBS(b.created_at, lang)}
                    </p>
                    <p className="font-mono text-[11px] text-[#78716C]">
                      Tables:{' '}
                      {Object.entries(b.table_counts_json || {})
                        .map(([k, v]) => `${k}(${v})`)
                        .join(', ') || 'None'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/admin/maintenance/backups/${b.id}/download`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] text-xs font-medium hover:bg-[#F3F1EC]"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download JSON
                    </a>
                    {b.record_count > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRestoreTarget(b);
                          setRestorePassword('');
                        }}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 8. IMMUTABLE CLEANUP AUDIT HISTORY */}
      {subTab === 'history' && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm text-[#0F172A]">
                {lang === 'ne' ? 'अपरिवर्तनीय सफाई अडिट इतिहास' : 'Immutable Cleanup Audit Trail'}
              </h3>
              <p className="text-xs text-[#57534E]">
                Protected by PostgreSQL immutability trigger — records cannot be edited or deleted.
              </p>
            </div>
            {history.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const csvRows = [
                    ['Timestamp', 'Admin', 'Category', 'Mode', 'Status', 'Deleted', 'Retained', 'Skipped', 'Failed', 'BackupID', 'Reason'],
                    ...history.map((h) => [
                      h.created_at,
                      h.admin_name || h.admin_email || h.admin_user_id || '',
                      h.category,
                      h.mode,
                      h.execution_status,
                      String(h.deleted_count),
                      String(h.retained_count),
                      String(h.skipped_count),
                      String(h.failed_count),
                      h.backup_id || '',
                      `"${String(h.reason || '').replace(/"/g, '""')}"`,
                    ]),
                  ];
                  downloadBlob(
                    `cleanup-audit-history-${new Date().toISOString().slice(0, 10)}.csv`,
                    csvRows.map((r) => r.join(',')).join('\n'),
                    'text/csv;charset=utf-8'
                  );
                }}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
              </Button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#78716C]">No cleanup executions logged yet.</p>
          ) : (
            <div className="divide-y divide-[#F3F1EC] text-xs">
              {history.map((h) => (
                <div key={h.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono px-1.5 py-0.5 rounded bg-[#0F172A] text-white text-[10px]">
                        {h.mode}
                      </span>
                      <strong className="text-sm text-[#0F172A]">{h.category}</strong>
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-medium ${
                          h.execution_status === 'completed'
                            ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                            : h.execution_status === 'blocked'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-red-50 text-[#B91C1C] border-red-200'
                        }`}
                      >
                        {h.execution_status}
                      </span>
                    </div>
                    <p className="text-[#57534E]">
                      Admin: <strong>{h.admin_name || h.admin_email || h.admin_user_id}</strong> · Reason: {h.reason}
                    </p>
                    <p className="font-mono text-[11px] text-[#78716C]">
                      Deleted: {h.deleted_count} · Retained: {h.retained_count} · Skipped: {h.skipped_count} · Failed:{' '}
                      {h.failed_count} · {formatDateBS(h.created_at, lang)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setInspectHistory(h)}>
                    <Eye className="w-3.5 h-3.5 mr-1" /> Details
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RECORD INSPECT MODAL */}
      {inspectRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setInspectRecord(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-[#78716C]">{inspectRecord.table} · {inspectRecord.id}</p>
                <h3 className="text-base font-bold text-[#0F172A]">{inspectRecord.label}</h3>
              </div>
              <button type="button" onClick={() => setInspectRecord(null)} className="p-1 text-[#78716C] hover:text-[#0F172A] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs space-y-1 bg-[#FAF9F6] border border-[#E5E2DC] rounded-lg p-3">
              <p className="font-semibold text-[#0F172A]">Classification Reasons:</p>
              <ul className="list-disc pl-4 text-[#57534E]">
                {inspectRecord.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <pre className="text-[11px] font-mono bg-[#0F172A] text-slate-100 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(inspectRecord.rawPreview, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* AUDIT HISTORY DETAILS MODAL */}
      {inspectHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setInspectHistory(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-[#78716C]">{inspectHistory.id}</p>
                <h3 className="text-base font-bold text-[#0F172A]">{inspectHistory.category} ({inspectHistory.mode})</h3>
              </div>
              <button type="button" onClick={() => setInspectHistory(null)} className="p-1 text-[#78716C] hover:text-[#0F172A] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-[#0F172A] text-slate-100 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(
                {
                  selectedIds: inspectHistory.selected_ids_json,
                  backupId: inspectHistory.backup_id,
                  backupChecksum: inspectHistory.backup_checksum,
                  details: inspectHistory.details_json,
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      )}

      {/* EXECUTE CLEANUP PASSWORD RE-AUTH MODAL */}
      {execModalOpen && preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !executing && setExecModalOpen(false)}
        >
          <form
            onSubmit={handleExecuteCleanup}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">
                  {cleanupMode === 'permanent_delete'
                    ? 'Confirm Permanent Cleanup (With Backup)'
                    : 'Confirm Soft-Archive Cleanup'}
                </h3>
                <p className="text-xs text-[#57534E]">
                  Eligible: {preview.eligibleCount} · Retained/Blocked: {preview.blockedCount}
                </p>
              </div>
              <button type="button" onClick={() => !executing && setExecModalOpen(false)} className="p-1 text-[#78716C] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {cleanupMode === 'permanent_delete' && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#B91C1C]">
                <strong>Irreversible Database Removal:</strong> A verified JSON backup snapshot will be stored before rows are removed.
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-medium">Cleanup Reason *</label>
                <Input
                  required
                  minLength={5}
                  placeholder="e.g., Remove synthetic QA test cooperative and expired OTP logs"
                  value={execReason}
                  onChange={(e) => setExecReason(e.target.value)}
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Type <span className="font-mono text-[#B91C1C]">CONFIRM CLEANUP</span> *</label>
                <Input
                  required
                  placeholder="CONFIRM CLEANUP"
                  value={execPhrase}
                  onChange={(e) => setExecPhrase(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Super Admin Password Re-Authentication *</label>
                <Input
                  type="password"
                  required
                  placeholder="Enter your Super Admin password"
                  value={execPassword}
                  onChange={(e) => setExecPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" disabled={executing} onClick={() => setExecModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant={cleanupMode === 'permanent_delete' ? 'destructive' : 'default'} disabled={executing}>
                {executing ? 'Executing...' : 'Verify Password & Execute'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* RESTORE BACKUP PASSWORD MODAL */}
      {restoreTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !restoring && setRestoreTarget(null)}
        >
          <form
            onSubmit={handleRestoreBackup}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Restore Verified Backup Snapshot</h3>
                <p className="text-xs text-[#57534E]">{restoreTarget.backup_label}</p>
              </div>
              <button type="button" onClick={() => !restoring && setRestoreTarget(null)} className="p-1 text-[#78716C] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-medium">Recovery Reason *</label>
                <Input required value={restoreReason} onChange={(e) => setRestoreReason(e.target.value)} />
              </div>
              <div>
                <label className="block mb-1 font-medium">Super Admin Password *</label>
                <Input
                  type="password"
                  required
                  placeholder="Enter Super Admin password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" disabled={restoring} onClick={() => setRestoreTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={restoring}>
                {restoring ? 'Restoring...' : 'Verify Password & Restore'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
