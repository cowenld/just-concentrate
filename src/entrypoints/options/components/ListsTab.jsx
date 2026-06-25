import { useState, useEffect } from 'preact/hooks';
import { getLists, getSchedules, deleteList } from '../../../lib/storage.js';
import { PRESETS, loadPresets, addPresetList } from '../../../lib/templates.js';
import { Icon } from '../../../components/Icon.jsx';
import { Modal } from '../../../components/Modal.jsx';
import { ListModal } from './ListModal.jsx';

export function ListsTab() {
  const [lists, setLists] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [editingList, setEditingList] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [deletingList, setDeletingList] = useState(null);
  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState({});
  const [presetsLoaded, setPresetsLoaded] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const [l, s] = await Promise.all([getLists(), getSchedules()]);
    setLists(l);
    setSchedules(s);
  }

  async function confirmDelete() {
    if (!deletingList) return;
    await deleteList(deletingList.id);
    setDeletingList(null);
    refresh();
  }

  async function togglePresets() {
    if (!showPresets && !presetsLoaded) {
      await loadPresets();
      setPresets({ ...PRESETS });
      setPresetsLoaded(true);
    }
    setShowPresets(v => !v);
  }

  async function addPreset(key) {
    const { created } = await addPresetList(key);
    if (created) chrome.runtime.sendMessage({ type: 'refreshRules' });
    await loadPresets();
    setPresets({ ...PRESETS });
    refresh();
  }

  const PRESET_ORDER = ['social', 'news', 'streaming', 'adult'];

  return (
    <section>
      <div class="flex justify-between items-start mb-5">
        <h2 class="text-[22px] font-medium text-ink">Site Lists</h2>
        <div class="flex gap-2 shrink-0">
          <button class="btn btn-outline" onClick={togglePresets}>+ FROM PRESET</button>
          <button class="btn btn-ink" onClick={() => setEditingList(null)}>+ NEW LIST</button>
        </div>
      </div>

      {showPresets && (
        <div class="border border-rule bg-elev p-4 mb-4">
          <div class="mono-cap mb-3">/// Bundled lists · add as reusable collections</div>
          <div class="flex flex-wrap gap-2">
            {PRESET_ORDER.map(key => {
              const p = presets[key];
              if (!p) return null;
              const added = lists.some(l =>
                (p.origin === 'live' && l.presetKey === key) || l.name === p.name
              );
              const isLive = p.origin === 'live';
              return (
                <button
                  key={key}
                  class={`btn btn-outline ${added ? 'opacity-40 cursor-not-allowed' : ''}`}
                  disabled={added}
                  onClick={() => !added && addPreset(key)}
                >
                  {p.name} · {p.sites.length}
                  {added ? ' ✓' : isLive ? <span class="chip chip-accent h-[18px] px-1.5 text-[9px] ml-1">LIVE</span> : null}
                </button>
              );
            })}
          </div>
          <p class="text-[12px] text-ink-3 mt-3 leading-relaxed">
            Lists tagged <span class="text-accent font-mono">LIVE</span> refresh automatically when Just Concentrate updates. Others are a snapshot you can edit freely.
          </p>
        </div>
      )}

      {lists.length === 0 ? (
        <div class="text-center py-12 px-6">
          <p class="text-sm text-ink-3 mb-5">No lists yet. Lists let you group sites and reuse them across schedules.</p>
          <button class="btn btn-ink" onClick={() => setEditingList(null)}>CREATE A LIST</button>
        </div>
      ) : (
        <div class="flex flex-col gap-3">
          {lists.map(l => {
            const usedIn = schedules.filter(s => (s.listIds || []).includes(l.id));
            const usedStr = usedIn.length > 0
              ? `Used in ${usedIn.map(s => s.name).join(', ')}`
              : 'Not used in any schedule';
            return (
              <div key={l.id} class="bg-card border border-rule p-4">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-[15px] font-semibold text-ink">{l.name}</span>
                  <div class="flex gap-1 items-center">
                    <button class="icon-btn" onClick={() => setEditingList(l)} title="Edit"><Icon name="pencil" size={14} /></button>
                    <button class="icon-btn" onClick={() => setDeletingList(l)} title="Delete"><Icon name="trash" size={14} /></button>
                  </div>
                </div>
                <div class="mono-cap mb-2">{l.sites.length} SITES · {usedStr.toUpperCase()}</div>
                <div class="flex flex-wrap gap-1">
                  {l.sites.map(s => (
                    <span key={s} class="chip chip-muted text-[10px] h-[20px] px-2">{s}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div class="callout mt-5">
        Lists are reusable groups of sites you can attach to any schedule. Edit a list once and every schedule using it updates automatically.
      </div>

      {editingList !== undefined && (
        <ListModal
          list={editingList}
          onClose={() => setEditingList(undefined)}
          onSaved={() => { setEditingList(undefined); refresh(); }}
        />
      )}

      <Modal visible={!!deletingList} onClose={() => setDeletingList(null)} title="Delete List">
        <p class="text-sm text-ink-3 mb-5">
          Are you sure you want to delete <strong class="text-ink">{deletingList?.name}</strong>? It will be detached from all schedules.
        </p>
        <div class="flex justify-end gap-3">
          <button class="btn btn-outline" onClick={() => setDeletingList(null)}>Cancel</button>
          <button class="btn bg-red-600 text-white hover:bg-red-700" onClick={confirmDelete}>Delete</button>
        </div>
      </Modal>
    </section>
  );
}
