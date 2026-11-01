import type { AgentRole, AgentRoleType, Team } from '@jarvis-os/core';
import { generateId } from '@jarvis-os/core';
import {
  Bot,
  Database,
  Globe,
  Grid,
  Mic,
  Save,
  Settings,
  TrendingUp,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface TeamEditorProps {
  team: Team | null;
  onClose: () => void;
  onSave: (team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

const roleTypes: AgentRoleType[] = [
  'planner',
  'architect',
  'coder',
  'reviewer',
  'tester',
  'researcher',
  'docs',
  'custom',
];
const teamCategories = [
  { id: 'Backend', icon: Database },
  { id: 'Frontend', icon: Globe },
  { id: 'DevOps', icon: Settings },
  { id: 'Research', icon: Bot },
  { id: 'Video', icon: Video },
  { id: 'Voice', icon: Mic },
  { id: 'Trading', icon: TrendingUp },
  { id: 'General', icon: Grid },
];

export function TeamEditor({ team, onClose, onSave }: TeamEditorProps) {
  const isEditing = !!team;
  const [name, setName] = useState(team?.name || '');
  const [description, setDescription] = useState(team?.description || '');
  const [workingDir, setWorkingDir] = useState(team?.workingDir || '');
  const [category, setCategory] = useState(team?.name || 'General');
  const [roles, setRoles] = useState<AgentRole[]>(
    team?.roles || [
      { id: 'planner', name: 'Planner', type: 'planner', skills: [] },
      { id: 'coder', name: 'Coder', type: 'coder', skills: [] },
      { id: 'reviewer', name: 'Reviewer', type: 'reviewer', skills: [] },
      { id: 'tester', name: 'Tester', type: 'tester', skills: [] },
    ]
  );
  const [enabledSkills, setEnabledSkills] = useState<string[]>(team?.enabledSkills || []);

  useEffect(() => {
    if (team) {
      setName(team.name);
      setDescription(team.description || '');
      setWorkingDir(team.workingDir);
      setRoles(team.roles);
      setEnabledSkills(team.enabledSkills);
      const cat = teamCategories.find((c) => c.id === team.name)?.id || 'General';
      setCategory(cat);
    }
  }, [team]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      workingDir: workingDir.trim() || process.cwd(),
      roles,
      enabledSkills,
    });
  };

  const addRole = () => {
    setRoles([
      ...roles,
      {
        id: generateId(),
        name: `Role ${roles.length + 1}`,
        type: 'custom',
        skills: [],
      },
    ]);
  };

  const updateRole = (index: number, field: keyof AgentRole, value: any) => {
    setRoles(roles.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const removeRole = (index: number) => {
    if (roles.length <= 1) return;
    setRoles(roles.filter((_, i) => i !== index));
  };

  const toggleSkill = (skillId: string) => {
    setEnabledSkills((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {isEditing ? 'Edit Team' : 'New Team'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="p-4 space-y-6"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Team Name
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setName(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {teamCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    <cat.icon className="w-4 h-4 inline mr-2" /> {cat.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Custom Name (optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Backend Team"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What does this team do?"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Working Directory
              </label>
              <input
                type="text"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                placeholder="/path/to/project"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900 dark:text-white">Agent Roles</h4>
              <button
                type="button"
                onClick={addRole}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                + Add Role
              </button>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {roles.map((role, index) => (
                <div
                  key={role.id}
                  className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <select
                    value={role.type}
                    onChange={(e) => updateRole(index, 'type', e.target.value as AgentRoleType)}
                    className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  >
                    {roleTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={role.name}
                    onChange={(e) => updateRole(index, 'name', e.target.value)}
                    placeholder="Role name"
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  />
                  <input
                    type="text"
                    value={role.skills.join(', ')}
                    onChange={(e) =>
                      updateRole(
                        index,
                        'skills',
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                      )
                    }
                    placeholder="skills (comma separated)"
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  />
                  {roles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRole(index)}
                      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Enabled Skills</h4>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {[
                'super:brainstorming',
                'super:writing-plans',
                'super:test-driven-development',
                'super:subagent-driven-development',
                'super:using-git-worktrees',
                'ecc:tdd-workflow',
                'ecc:code-review',
                'ecc:security-review',
                'matt:grill-me',
                'matt:tdd',
                'matt:diagnosing-bugs',
                'matt:improve-codebase-architecture',
                'matt:code-review',
              ].map((skill) => (
                <label
                  key={skill}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors
                  {enabledSkills.includes(skill)
                    ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-300 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }"
                >
                  <input
                    type="checkbox"
                    checked={enabledSkills.includes(skill)}
                    onChange={() => toggleSkill(skill)}
                    className="sr-only"
                  />
                  <span>{skill}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isEditing ? 'Save Changes' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
