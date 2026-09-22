import { useEffect, useState } from 'react';
import { api, type LeaderboardRow } from '../api/client';
import { haptic, isTelegram, webApp } from '../telegram';

export function FriendsLeaderboard({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [share, setShare] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState('');
  const [myId, setMyId] = useState<number | null>(null);

  const load = () =>
    api
      .leaderboard()
      .then((data) => {
        setRows(data.rows);
        setShare(data.share);
      })
      .catch((loadError: Error) => setError(loadError.message));

  useEffect(() => {
    void load();
    api.appInfo().then((info) => setBotUsername(info.botUsername)).catch(() => {});
    api.me().then((user) => setMyId(user.id)).catch(() => {});
  }, [refreshKey]);

  // Ссылка-приглашение: кто откроет её, автоматически станет твоим другом.
  const inviteLink = botUsername && myId ? `https://t.me/${botUsername}/app?startapp=ref_${myId}` : '';

  const invite = () => {
    if (!inviteLink) return;
    haptic('tap');
    const text = 'Считаю свои траты в Recy. Проверь, кто из нас больше шопоголик';
    const share = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
    if (isTelegram()) webApp()?.openTelegramLink(share);
    else window.open(share, '_blank');
  };

  const addFriend = async () => {
    try {
      const result = await api.addFriend(username);
      setUsername('');
      setError(null);
      setNotice(`${result.friend.username} теперь в твоём лидерборде`);
      haptic('success');
      await load();
    } catch (addError) {
      haptic('error');
      setNotice(null);
      setError((addError as Error).message);
    }
  };

  return (
    <section className="card">
      <h2>Лидерборд друзей</h2>
      <div className="table-scroll">
        <table className="leaderboard">
          <thead>
          <tr>
            <th>#</th>
            <th>Друг</th>
            <th>Траты за месяц</th>
            <th>Рейтинг</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.userId} className={row.isMe ? 'me' : undefined}>
              <td>{index + 1}</td>
              <td>
                {row.isMe ? 'Ты' : row.name}
                {!row.eligible && (
                  <span className="tag warn" title="Нужно 10+ чеков с QR, чтобы попасть в зачёт">
                    мало QR
                  </span>
                )}
              </td>
              <td>{Math.round(row.total).toLocaleString('ru-RU')}р</td>
              <td>{row.rating.toFixed(2)}/10.00</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      <p className="share">{share}</p>

      <div className="add-friend">
        <input
          id="friend-username"
          placeholder="@имя в Telegram"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="off"
        />
        <button type="button" className="ghost-button" onClick={addFriend} disabled={!username.trim()}>
          Добавить
        </button>
      </div>

      {inviteLink && (
        <button type="button" className="big-button" onClick={invite}>
          Позвать друга ссылкой
        </button>
      )}

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
