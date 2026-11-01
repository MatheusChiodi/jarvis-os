import {
  Bell,
  Cpu,
  Database,
  GitBranch,
  Grid,
  Loader2,
  Mic,
  Palette,
  Save,
  Shield,
  Terminal,
  User,
  Video,
} from 'lucide-react';
import { useState } from 'react';
import { useConfigStore } from '../../stores/configStore';
import { useTeamsStore } from '../../stores/teamsStore';

const sections = [
  { id: 'general', label: 'General', icon: User },
  { id: 'teams', label: 'Teams', icon: GitBranch },
  { id: 'memory', label: 'Memory', icon: Database },
  { id: 'skills', label: 'Skills', icon: Cpu },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'pixel', label: 'Pixel Agents', icon: Grid },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'advanced', label: 'Advanced', icon: Terminal },
] as const;

type SettingsSection = (typeof sections)[number]['id'];

export function SettingsView() {
  const { config, updateConfig, saveConfig } = useConfigStore();
  const { teams } = useTeamsStore();
  const [activeSection, setActiveSection] = useState<SettingsSection>(sections[0].id);
  const [saving, setSaving] = useState(false);
  const [hotkeyInput, setHotkeyInput] = useState(config.hotkey);
  const [listeningHotkey, setListeningHotkey] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure JARVIS-OS preferences
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-52 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <nav className="flex-1 overflow-y-auto p-2 space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <section.icon className="w-5 h-5 flex-shrink-0" />
                {section.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === 'general' && (
            <GeneralSettings
              config={config}
              hotkeyInput={hotkeyInput}
              setHotkeyInput={setHotkeyInput}
              listeningHotkey={listeningHotkey}
              setListeningHotkey={setListeningHotkey}
              onUpdate={updateConfig}
            />
          )}
          {activeSection === 'teams' && <TeamsSettings teams={teams} />}
          {activeSection === 'memory' && <MemorySettings config={config} onUpdate={updateConfig} />}
          {activeSection === 'skills' && <SkillsSettings config={config} onUpdate={updateConfig} />}
          {activeSection === 'voice' && <VoiceSettings config={config} onUpdate={updateConfig} />}
          {activeSection === 'video' && <VideoSettings config={config} onUpdate={updateConfig} />}
          {activeSection === 'pixel' && <PixelSettings config={config} onUpdate={updateConfig} />}
          {activeSection === 'security' && <SecuritySettings />}
          {activeSection === 'notifications' && <NotificationSettings />}
          {activeSection === 'appearance' && (
            <AppearanceSettings config={config} onUpdate={updateConfig} />
          )}
          {activeSection === 'advanced' && <AdvancedSettings />}
        </div>
      </div>
    </div>
  );
}

function SettingGroup({
  title,
  description,
  children,
}: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-1 max-w-md">{children}</div>
    </div>
  );
}

function GeneralSettings({
  config,
  hotkeyInput,
  setHotkeyInput,
  listeningHotkey,
  setListeningHotkey,
  onUpdate,
}: any) {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup title="Hotkey" description="Global keyboard shortcut to open/close JARVIS-OS">
        <SettingRow
          label="Global Hotkey"
          description="Press this combination to toggle the overlay"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={hotkeyInput}
              onChange={(e) => setHotkeyInput(e.target.value)}
              readOnly={listeningHotkey}
              onClick={() => !listeningHotkey && setListeningHotkey(true)}
              onKeyDown={(e) => {
                if (listeningHotkey) {
                  e.preventDefault();
                  const keys = [];
                  if (e.metaKey) keys.push('Meta');
                  if (e.ctrlKey) keys.push('Control');
                  if (e.shiftKey) keys.push('Shift');
                  if (e.altKey) keys.push('Alt');
                  if (
                    e.key !== 'Meta' &&
                    e.key !== 'Control' &&
                    e.key !== 'Shift' &&
                    e.key !== 'Alt'
                  ) {
                    keys.push(e.key);
                  }
                  setHotkeyInput(keys.join('+'));
                  setListeningHotkey(false);
                }
              }}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 font-mono"
              placeholder={listeningHotkey ? 'Press key combination...' : 'Super+Alt+J'}
            />
            {listeningHotkey && (
              <span className="text-sm text-blue-600 dark:text-blue-400">Listening...</span>
            )}
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Overlay Behavior" description="How the overlay window behaves">
        <SettingRow
          label="Animations"
          description="Enable smooth animations for overlay transitions"
        >
          <input
            type="checkbox"
            checked={config.overlay.animations}
            onChange={(e) =>
              onUpdate({ overlay: { ...config.overlay, animations: e.target.checked } })
            }
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Theme" description="Color theme for the overlay">
          <select
            value={config.overlay.theme}
            onChange={(e) => onUpdate({ overlay: { ...config.overlay, theme: e.target.value } })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-xs"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Language" description="Interface language">
        <SettingRow label="Language" description="UI language (requires restart)">
          <select className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-xs">
            <option value="en">English</option>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="es">Español</option>
          </select>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

function TeamsSettings({ teams }: { teams: any[] }) {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup title="Teams" description="Manage your agent teams">
        <div className="space-y-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold">
                  {team.name.charAt(0)}
                </span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{team.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {team.roles.length} roles · {team.enabledSkills.length} skills
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                  Edit
                </button>
                <button className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                  Delete
                </button>
              </div>
            </div>
          ))}
          <button className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 transition-colors">
            + Create New Team
          </button>
        </div>
      </SettingGroup>
    </div>
  );
}

function MemorySettings({ config, onUpdate }: any) {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup title="Vault" description="Memory vault configuration">
        <SettingRow label="Vault Path" description="Where memory vaults are stored">
          <input
            type="text"
            value={config.memory.vaultPath}
            onChange={(e) => onUpdate({ memory: { ...config.memory, vaultPath: e.target.value } })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 font-mono w-full max-w-md"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Vector Search" description="Semantic search using embeddings">
        <SettingRow
          label="Enable Vector Search"
          description="Use embeddings for semantic similarity search"
        >
          <input
            type="checkbox"
            checked={config.memory.vectorSearch}
            onChange={(e) =>
              onUpdate({ memory: { ...config.memory, vectorSearch: e.target.checked } })
            }
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Embedding Model" description="Model used for generating embeddings">
          <select
            value={config.memory.embeddingModel}
            onChange={(e) =>
              onUpdate({ memory: { ...config.memory, embeddingModel: e.target.value } })
            }
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-md"
          >
            <option value="Xenova/all-MiniLM-L6-v2">all-MiniLM-L6-v2 (384 dim, 22MB)</option>
            <option value="Xenova/all-MiniLM-L12-v2">all-MiniLM-L12-v2 (384 dim, 45MB)</option>
            <option value="Xenova/paraphrase-multilingual-MiniLM-L12-v2">
              Multilingual MiniLM-L12 (384 dim, 45MB)
            </option>
          </select>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Hooks" description="Automatic memory enforcement">
        <SettingRow
          label="Task Completed Hook"
          description="Require note before marking task complete"
        >
          <input
            type="checkbox"
            checked={config.memory.hooks.taskCompleted}
            onChange={(e) =>
              onUpdate({
                memory: {
                  ...config.memory,
                  hooks: { ...config.memory.hooks, taskCompleted: e.target.checked },
                },
              })
            }
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Teammate Idle Hook" description="Require note when teammate goes idle">
          <input
            type="checkbox"
            checked={config.memory.hooks.teammateIdle}
            onChange={(e) =>
              onUpdate({
                memory: {
                  ...config.memory,
                  hooks: { ...config.memory.hooks, teammateIdle: e.target.checked },
                },
              })
            }
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

function SkillsSettings({ config, onUpdate }: any) {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup
        title="Built-in Skill Collections"
        description="Enable/disable built-in skill sources"
      >
        {[
          { id: 'core', name: 'Core Skills', description: 'Essential skills for basic operation' },
          { id: 'superpowers', name: 'Superpowers', description: 'Methodology workflow skills' },
          { id: 'ecc', name: 'ECC', description: '314 skills for agent harness OS' },
          {
            id: 'mattpocock',
            name: 'Matt Pocock Skills',
            description: 'Engineering & productivity skills',
          },
        ].map((source) => (
          <SettingRow key={source.id} label={source.name} description={source.description}>
            <input
              type="checkbox"
              checked={config.skills.enabled.includes(source.id)}
              onChange={(e) =>
                onUpdate({
                  skills: {
                    ...config.skills,
                    enabled: e.target.checked
                      ? [...config.skills.enabled, source.id]
                      : config.skills.enabled.filter((s: string) => s !== source.id),
                  },
                })
              }
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </SettingRow>
        ))}
      </SettingGroup>

      <SettingGroup title="Custom Skills" description="Path to custom skills directory">
        <SettingRow label="Custom Skills Path" description="Directory for user-created skills">
          <input
            type="text"
            value={config.skills.customPath}
            onChange={(e) => onUpdate({ skills: { ...config.skills, customPath: e.target.value } })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 font-mono w-full max-w-md"
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

function VoiceSettings({ config, onUpdate }: any) {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup title="Voice Assistant" description="Voice input/output configuration">
        <SettingRow
          label="Enable Voice"
          description="Enable wake word detection and voice commands"
        >
          <input
            type="checkbox"
            checked={config.voice.enabled}
            onChange={(e) => onUpdate({ voice: { ...config.voice, enabled: e.target.checked } })}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Wake Word" description="Word that activates voice listening">
          <select
            value={config.voice.wakeWord}
            onChange={(e) => onUpdate({ voice: { ...config.voice, wakeWord: e.target.value } })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-xs"
          >
            <option value="jarvis">Jarvis</option>
            <option value="odisseu">Odisseu</option>
            <option value="computer">Computer</option>
            <option value="hey-assistant">Hey Assistant</option>
          </select>
        </SettingRow>
        <SettingRow label="TTS Voice" description="Piper voice for text-to-speech">
          <select
            value={config.voice.ttsVoice}
            onChange={(e) => onUpdate({ voice: { ...config.voice, ttsVoice: e.target.value } })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-xs"
          >
            <option value="faber">Faber (default)</option>
            <option value="cadu">Cadu</option>
            <option value="jeff">Jeff</option>
          </select>
        </SettingRow>
        <SettingRow label="STT Engine" description="Speech-to-text engine">
          <select
            value={config.voice.sttEngine}
            onChange={(e) => onUpdate({ voice: { ...config.voice, sttEngine: e.target.value } })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-xs"
          >
            <option value="web-speech">Web Speech API (browser)</option>
            <option value="whisper-cpp">Whisper.cpp (local)</option>
          </select>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

function VideoSettings({ config, onUpdate }: any) {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup
        title="Video Generation"
        description="Video generation with HyperFrames/Remotion"
      >
        <SettingRow label="Enable Video" description="Enable video generation capabilities">
          <input
            type="checkbox"
            checked={config.video.enabled}
            onChange={(e) => onUpdate({ video: { ...config.video, enabled: e.target.checked } })}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Video Engine" description="Rendering engine for video generation">
          <select
            value={config.video.engine}
            onChange={(e) => onUpdate({ video: { ...config.video, engine: e.target.value } })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-xs"
          >
            <option value="hyperframes">HyperFrames (HTML → Video)</option>
            <option value="remotion">Remotion (React → Video)</option>
          </select>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

function PixelSettings({ config, onUpdate }: any) {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup
        title="Pixel Agents Visualizer"
        description="Animated pixel-art office for agent visualization"
      >
        <SettingRow
          label="Enable Pixel Agents"
          description="Show agents as animated characters in an office"
        >
          <input
            type="checkbox"
            checked={config.pixel.enabled}
            onChange={(e) => onUpdate({ pixel: { ...config.pixel, enabled: e.target.checked } })}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Server Port" description="Port for Pixel Agents standalone server">
          <input
            type="number"
            value={config.pixel.port}
            onChange={(e) =>
              onUpdate({ pixel: { ...config.pixel, port: Number.parseInt(e.target.value) } })
            }
            min={1024}
            max={65535}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-xs"
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup
        title="Private Content"
        description="Content tagged with <private> is excluded from memory"
      >
        <SettingRow
          label="Auto-detect Secrets"
          description="Automatically detect and tag API keys, passwords"
        >
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow
          label="Redact in Logs"
          description="Remove sensitive data from logs and statusline"
        >
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Network" description="Network access control">
        <SettingRow label="Allowed LLM Providers" description="Domains allowed for LLM API calls">
          <textarea
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-md h-20 font-mono text-sm"
            placeholder="api.anthropic.com&#10;api.openai.com&#10;api.github.com"
          />
        </SettingRow>
        <SettingRow
          label="Block All Other Network"
          description="Prevent any other outbound connections"
        >
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Telemetry" description="Anonymous usage statistics">
        <SettingRow
          label="Enable Telemetry"
          description="Help improve JARVIS-OS with anonymous usage data"
        >
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

function NotificationSettings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup
        title="Desktop Notifications"
        description="System notifications for agent events"
      >
        <SettingRow label="Task Complete" description="Notify when agent finishes a task">
          <input
            type="checkbox"
            checked
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Agent Waiting" description="Notify when agent needs input">
          <input
            type="checkbox"
            checked
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Errors" description="Notify on agent errors or failures">
          <input
            type="checkbox"
            checked
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Plan Complete" description="Notify when entire plan finishes">
          <input
            type="checkbox"
            checked
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Sound" description="Audio notifications">
        <SettingRow label="Enable Sounds" description="Play chime for notifications">
          <input
            type="checkbox"
            checked
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Sound Theme" description="Notification sound style">
          <select className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-xs">
            <option value="default">Default</option>
            <option value="subtle">Subtle</option>
            <option value="mechanical">Mechanical</option>
          </select>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

function AppearanceSettings({ config, onUpdate }: any) {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup title="Theme" description="Visual appearance">
        <SettingRow label="Color Theme">
          <div className="flex gap-2">
            {['system', 'light', 'dark'].map((t) => (
              <button
                key={t}
                onClick={() => onUpdate({ overlay: { ...config.overlay, theme: t } })}
                className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                  config.overlay.theme === t
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Density" description="UI compactness">
        <SettingRow label="Compact Mode" description="Reduce padding and spacing">
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Animations" description="Motion preferences">
        <SettingRow
          label="Reduced Motion"
          description="Disable non-essential animations (respects system setting)"
        >
          <input
            type="checkbox"
            checked={config.overlay.animations === false}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

function AdvancedSettings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <SettingGroup title="Developer" description="Advanced options for developers">
        <SettingRow label="Debug Mode" description="Enable verbose logging and debug tools">
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
        <SettingRow label="Log Level" description="Minimum log level to display">
          <select className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-full max-w-xs">
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </SettingRow>
        <SettingRow
          label="DevTools"
          description="Open WebView DevTools on startup (development only)"
        >
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Data" description="Data management">
        <SettingRow label="Export All Data" description="Export configuration, memory, and teams">
          <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            Export
          </button>
        </SettingRow>
        <SettingRow label="Import Data" description="Import previously exported data">
          <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            Import
          </button>
        </SettingRow>
        <SettingRow label="Reset to Defaults" description="Reset all settings to factory defaults">
          <button className="px-4 py-2 border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
            Reset
          </button>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="About" description="Version and license information">
        <SettingRow label="Version" description="JARVIS-OS version">
          <span className="text-gray-500 dark:text-gray-400 font-mono">0.1.0-dev</span>
        </SettingRow>
        <SettingRow label="License" description="MIT License">
          <span className="text-gray-500 dark:text-gray-400">MIT</span>
        </SettingRow>
        <SettingRow label="Repository" description="GitHub repository">
          <a
            href="https://github.com/MatheusChiodi/jarvis-os"
            target="_blank"
            className="text-blue-600 dark:text-blue-400 hover:underline"
            rel="noreferrer"
          >
            github.com/MatheusChiodi/jarvis-os
          </a>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
