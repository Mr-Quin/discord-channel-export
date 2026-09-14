import { useCallback, useEffect, useState } from "react";
import type { StoredConversation } from "../core/model";
import { type ExportReply, type OutputId, send } from "../core/protocol";
import { DEFAULT_SETTINGS, loadSettings, type Settings, saveSettings } from "../core/settings";

const OUTPUTS: OutputId[] = ["json", "html", "csv"];

export function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [rows, setRows] = useState<StoredConversation[]>([]);
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(() => send<StoredConversation[]>({ type: "list" }).then(setRows), []);
  useEffect(() => {
    void loadSettings().then(setSettings);
    void refresh();
  }, [refresh]);

  const update = async (patch: Partial<Settings>) => setSettings(await saveSettings(patch));

  const exportRow = async (row: StoredConversation, output: OutputId) => {
    setError(undefined);
    try {
      const reply = await send<ExportReply | { error: string }>({
        type: "export",
        request: { conversation: row, output, range: { kind: "all" } },
      });
      if ("error" in reply) throw new Error(reply.error);
      setNote(`${reply.count} messages written to ${reply.filename}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const clearRow = async (row: StoredConversation) => {
    if (!confirm(`Delete ${row.count} stored messages for #${row.name ?? row.id}?`)) return;
    await send({ type: "clear", source: row.source, id: row.id });
    await refresh();
  };

  return (
    <div className="options">
      <h1>Discord Channel Export</h1>

      <h2>Loading</h2>
      <label className="field">
        <span>Scroll speed</span>
        <select
          value={settings.speed}
          onChange={(e) => update({ speed: e.target.value as Settings["speed"] })}
        >
          <option value="slow">slow (1.5 to 3 s between rounds)</option>
          <option value="normal">normal (0.7 to 1.8 s)</option>
          <option value="fast">fast (0.3 to 0.8 s)</option>
        </select>
      </label>
      <label className="field">
        <span>Give up after idle rounds</span>
        <input
          type="number"
          min={1}
          value={settings.idleRounds}
          onChange={(e) => update({ idleRounds: Math.max(1, Number(e.target.value)) })}
        />
      </label>
      <label className="field">
        <span>Default message count</span>
        <input
          type="number"
          min={1}
          value={settings.defaultCount}
          onChange={(e) => update({ defaultCount: Math.max(1, Number(e.target.value)) })}
        />
      </label>

      <h2>Export</h2>
      <label className="field">
        <span>Default format</span>
        <select
          value={settings.defaultOutput}
          onChange={(e) => update({ defaultOutput: e.target.value as OutputId })}
        >
          {OUTPUTS.map((o) => (
            <option key={o} value={o}>
              {o.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Filename template</span>
        <input
          type="text"
          value={settings.filenameTemplate}
          onChange={(e) => update({ filenameTemplate: e.target.value })}
        />
      </label>
      <p className="muted">
        Placeholders: {"{name} {id} {group} {groupId} {source} {stamp} {ext}"}. A slash makes a
        subfolder of the downloads folder.
      </p>
      <label className="field">
        <span>HTML theme</span>
        <select
          value={settings.htmlTheme}
          onChange={(e) => update({ htmlTheme: e.target.value as Settings["htmlTheme"] })}
        >
          <option value="dark">dark</option>
          <option value="light">light</option>
        </select>
      </label>

      <h2>Stored channels</h2>
      {rows.length === 0 ? (
        <p className="muted">Nothing stored.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Messages</th>
              <th>Range</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.source}/${r.id}`}>
                <td>
                  #{r.name ?? r.id}
                  {r.groupName && <div className="muted">{r.groupName}</div>}
                  <div className="muted">{r.id}</div>
                </td>
                <td className="num">{r.count}</td>
                <td className="muted">
                  {r.oldest?.timestamp.slice(0, 10)} to {r.newest?.timestamp.slice(0, 10)}
                </td>
                <td className="row">
                  {OUTPUTS.map((o) => (
                    <button key={o} type="button" onClick={() => void exportRow(r, o)}>
                      {o.toUpperCase()}
                    </button>
                  ))}
                  <button type="button" className="danger" onClick={() => void clearRow(r)}>
                    Clear
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {note && <p className="muted">{note}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
