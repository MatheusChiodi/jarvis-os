import type { SearchIndexItem, TimelineEvent } from '@jarvis-os/core';
import { invoke } from '@tauri-apps/api/core';
import { Database, Filter, Link, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTeamsStore } from '../../stores/teamsStore';

type MemoryViewMode = 'search' | 'timeline' | 'graph' | 'recent';

export function MemoryView() {
  const { activeTeamId } = useTeamsStore();
  const [mode, setMode] = useState<MemoryViewMode>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchIndexItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [filters, setFilters] = useState({ type: '', tag: '', agent: '' });

  useEffect(() => {
    if (mode === 'search' && query) {
      search();
    } else if (mode === 'timeline') {
      loadTimeline();
    } else if (mode === 'recent') {
      loadRecent();
    }
  }, [mode, query, filters, activeTeamId]);

  const search = async () => {
    if (!activeTeamId || !query.trim()) return;
    setLoading(true);
    try {
      const data = await invoke('memory_search_index', {
        projectId: activeTeamId,
        query,
        limit: 50,
      });
      setResults(data);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = async () => {
    if (!activeTeamId) return;
    setLoading(true);
    try {
      const data = await invoke('memory_get_timeline', { projectId: activeTeamId, windowDays: 30 });
      setTimeline(data);
    } catch (error) {
      console.error('Timeline failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecent = async () => {
    if (!activeTeamId) return;
    setLoading(true);
    try {
      const data = await invoke('memory_list_notes', { projectId: activeTeamId, limit: 20 });
      setResults(data.map((n: any) => ({ ...n, score: 1 })));
    } catch (error) {
      console.error('Recent failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadObservations = async (ids: string[]) => {
    if (!activeTeamId) return;
    setLoading(true);
    try {
      const data = await invoke('memory_get_observations', { projectId: activeTeamId, ids });
      setObservations(data);
      setSelectedIds(ids);
    } catch (error) {
      console.error('Observations failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = (item: SearchIndexItem) => {
    if (mode === 'search') {
      loadObservations([item.id]);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory... (progressive disclosure: search → timeline → observe)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            {['search', 'timeline', 'graph', 'recent'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m as MemoryViewMode)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {(mode === 'search' || mode === 'recent') && (
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            >
              <option value="">All Types</option>
              <option value="memory">Memory</option>
              <option value="decision">Decision</option>
              <option value="learning">Learning</option>
              <option value="communication">Communication</option>
              <option value="state">State</option>
            </select>
            <select
              value={filters.tag}
              onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            >
              <option value="">All Tags</option>
              <option value="tdd">tdd</option>
              <option value="security">security</option>
              <option value="architecture">architecture</option>
            </select>
            <select
              value={filters.agent}
              onChange={(e) => setFilters({ ...filters, agent: e.target.value })}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            >
              <option value="">All Agents</option>
              <option value="planner">planner</option>
              <option value="coder">coder</option>
              <option value="reviewer">reviewer</option>
              <option value="tester">tester</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {mode === 'search' && !loading && (
          <div className="p-4 overflow-y-auto">
            {results.length === 0 && !query ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Database className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">Search your memory</p>
                <p className="text-sm mt-2">Type a query to find relevant notes</p>
              </div>
            ) : results.length === 0 && query ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Search className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">No results found</p>
                <p className="text-sm mt-2">Try different keywords</p>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((item) => (
                  <SearchResultItem
                    key={item.id}
                    item={item}
                    onClick={() => handleResultClick(item)}
                    selected={selectedIds.includes(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'timeline' && !loading && (
          <div className="p-4 overflow-y-auto">
            {timeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Clock className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">No timeline data</p>
              </div>
            ) : (
              <div className="space-y-6">
                {timeline.map((event) => (
                  <TimelineEvent
                    key={event.timestamp}
                    event={event}
                    onObserve={(ids) => loadObservations(ids)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'recent' && !loading && (
          <div className="p-4 overflow-y-auto">
            <div className="space-y-2">
              {results.map((item) => (
                <SearchResultItem
                  key={item.id}
                  item={item}
                  onClick={() => handleResultClick(item)}
                />
              ))}
            </div>
          </div>
        )}

        {mode === 'graph' && (
          <div className="p-4 overflow-auto h-full">
            <div className="text-center py-12 text-gray-500">
              <Link className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Knowledge Graph</p>
              <p className="text-sm mt-2">Mermaid graph visualization coming soon</p>
            </div>
          </div>
        )}

        {showDetail && observations.length > 0 && (
          <ObservationDetailPanel
            observations={observations}
            onClose={() => {
              setShowDetail(null);
              setSelectedIds([]);
            }}
          />
        )}
      </div>
    </div>
  );
}

function SearchResultItem({
  item,
  onClick,
  selected,
}: { item: SearchIndexItem; onClick: () => void; selected: boolean }) {
  const typeColors: Record<string, string> = {
    memory: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    decision: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    learning: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    communication: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    state: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  };

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border transition-all cursor-pointer ${
        selected
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs rounded-full ${typeColors[item.type]}`}>
              {item.type}
            </span>
            <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
              {item.agent}
            </span>
            {item.pinned && (
              <span className="px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full">
                Pinned
              </span>
            )}
          </div>
          <h4 className="font-medium text-gray-900 dark:text-white truncate">{item.title}</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {item.summary}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {item.tags.map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                {tag}
              </span>
            ))}
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
            <span>Score: {item.score.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineEvent({
  event,
  onObserve,
}: { event: TimelineEvent; onObserve: (ids: string[]) => void }) {
  return (
    <div className="border-l-2 border-gray-200 dark:border-gray-700 pl-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {new Date(event.timestamp).toLocaleDateString()}
        </span>
        <span className="text-xs text-gray-500">({event.notes.length} notes)</span>
      </div>
      <div className="space-y-2 ml-6">
        {event.notes.map((note) => (
          <div
            key={note.id}
            className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-gray-900 dark:text-white">
                {note.title}
              </span>
              <button
                onClick={() => onObserve([note.id])}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Observe
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{note.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ObservationDetailPanel({
  observations,
  onClose,
}: { observations: any[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Observations ({observations.length})
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {observations.map((obs: any) => (
            <div
              key={obs.id}
              className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900 dark:text-white">{obs.title}</h4>
                <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded">
                  {obs.type}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                {obs.content}
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                <span>Agent: {obs.agent}</span>
                <span>Tags: {obs.tags.join(', ')}</span>
                <span>{new Date(obs.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { Clock, X } from 'lucide-react';
