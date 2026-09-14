import { useEffect, useState } from "react";
import type { StoredConversation } from "../core/model";
import { send } from "../core/protocol";

export function Popup() {
  const [rows, setRows] = useState<StoredConversation[]>([]);
  useEffect(() => {
    void send<StoredConversation[]>({ type: "list" }).then(setRows);
  }, []);
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <div>
      <h1>Discord Channel Export</h1>
      {rows.length === 0 ? (
        <p className="muted">
          Nothing captured yet. Open a Discord channel; the panel appears in the page.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Messages</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.source}/${r.id}`}>
                <td>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      #{r.name ?? r.id}
                    </a>
                  ) : (
                    <>#{r.name ?? r.id}</>
                  )}
                  {r.groupName && <div className="muted">{r.groupName}</div>}
                </td>
                <td className="num">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="row">
        <span className="muted">{total} messages stored</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
          Settings
        </button>
      </p>
    </div>
  );
}
