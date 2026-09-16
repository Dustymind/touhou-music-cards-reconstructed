/** 联机大厅：昵称、开房/加入、分享码、参与者列表、聊天、数据一致性自检。 */
import {
  Alert, Box, Button, Chip, Divider, FormControlLabel, Paper, Stack, Switch, TextField, Typography,
} from "@mui/material";
import { useState } from "react";

import { Localization, t } from "../../i18n/localization";
import { peerModeFromSearch, useNet } from "../../net/useNet";
import { NoFontFamily } from "../../theme/theme";

export interface LobbyPanelProps {
  /** 本地/CPU 模式下的单机提示 */
  onUsePeerTransport?: boolean;
}

export function LobbyPanel(_props: LobbyPanelProps) {
  const net = useNet();
  const [name, setName] = useState("Player");
  const [room, setRoom] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  // 带信令服务器参数的链接默认就走 PeerJS（跨浏览器 / 跨机器）
  const [peerMode, setPeerMode] = useState(peerModeFromSearch);
  const online = net.role !== null;

  return (
    <Paper variant="outlined" sx={{ p: 2, fontFamily: NoFontFamily }} data-testid="lobby">
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Typography variant="subtitle1">Online</Typography>
        <Chip size="small" label={net.status} data-testid="net-status" />
        <TextField
          size="small"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          sx={{ width: "10em" }}
          slotProps={{ htmlInput: { "aria-label": "net-name" } }}
        />
        {!online && (
          <>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={peerMode}
                  onChange={(event) => setPeerMode(event.target.checked)}
                  slotProps={{ input: { "aria-label": "net-peer-mode" } }}
                />
              }
              label={<Typography variant="caption">cross-machine (PeerJS)</Typography>}
            />
            <Button size="small" variant="contained" data-testid="net-host"
              onClick={() => void net.host({ name, peer: peerMode })}>
              Host
            </Button>
            <TextField
              size="small"
              label="Room"
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              sx={{ width: "9em" }}
              slotProps={{ htmlInput: { "aria-label": "net-room" } }}
            />
            <Button size="small" data-testid="net-join" disabled={!room}
              onClick={() => net.join({ roomId: room, name, peer: peerMode })}>
              Join
            </Button>
          </>
        )}
        {online && (
          <>
            {net.shareCode && (
              <Chip
                size="small"
                color="primary"
                label={`code: ${net.shareCode}`}
                data-testid="net-share-code"
                onClick={() => void navigator.clipboard?.writeText(net.shareCode ?? "")}
              />
            )}
            <Button size="small" data-testid="net-leave" onClick={() => net.leave()}>Leave</Button>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        {/* 界面上只显示前 24 个字符（布局考虑），完整摘要在 `data-digest` 里给 E2E 断言用 */}
        <Typography variant="caption" color="text.secondary" data-testid="net-digest" data-digest={net.digest}>
          digest {net.digest.slice(0, 24) || "-"}
        </Typography>
      </Stack>

      {net.error && <Alert severity="error" sx={{ mt: 1 }} data-testid="net-error">{net.error}</Alert>}

      {online && (
        <>
          <Divider sx={{ my: 1 }} />
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
            {net.peers.map((peer) => (
              <Chip
                key={peer.index}
                size="small"
                color={peer.isHost ? "primary" : "default"}
                variant={peer.index === net.myIndex ? "filled" : "outlined"}
                label={`${peer.index}: ${peer.name}${peer.isObserver ? " (obs)" : ""}${peer.isHost ? " ★" : ""}`}
              />
            ))}
          </Stack>

          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary">Chat</Typography>
          <Stack spacing={0.25} sx={{ maxHeight: 120, overflowY: "auto", my: 0.5 }} data-testid="chat-log">
            {net.chat.map((line, index) => (
              <Typography key={index} variant="caption">
                <b>{line.from}</b>{line.system ? "" : ":"} {line.text}
              </Typography>
            ))}
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              placeholder={t(Localization.ChatMessageHint)}
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && chatDraft.trim()) {
                  net.sendChat(chatDraft);
                  setChatDraft("");
                }
              }}
              slotProps={{ htmlInput: { "aria-label": "chat-input" } }}
            />
            <Button
              size="small"
              data-testid="chat-send"
              onClick={() => {
                if (!chatDraft.trim()) return;
                net.sendChat(chatDraft);
                setChatDraft("");
              }}
            >
              Send
            </Button>
          </Stack>
        </>
      )}
    </Paper>
  );
}
