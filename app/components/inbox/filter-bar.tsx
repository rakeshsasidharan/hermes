'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Search, X } from 'lucide-react';

export interface Filters {
  sender: string;
  subject: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { sender: '', subject: '', from: '', to: '' };

interface FilterBarProps {
  onFilter: (filters: Filters) => void;
}

export function FilterBar({ onFilter }: FilterBarProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY);

  function update(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onFilter(filters);
  }

  function handleClear() {
    setFilters(EMPTY);
    onFilter(EMPTY);
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-center">
      <Input
        placeholder="From"
        value={filters.sender}
        onChange={(e) => update('sender', e.target.value)}
        className="h-8 w-36 text-sm"
        aria-label="Filter by sender"
      />
      <Input
        placeholder="Subject"
        value={filters.subject}
        onChange={(e) => update('subject', e.target.value)}
        className="h-8 w-48 text-sm"
        aria-label="Filter by subject"
      />
      <DatePicker
        value={filters.from}
        onChange={(v) => update('from', v)}
        placeholder="After date"
        aria-label="Filter from date"
      />
      <DatePicker
        value={filters.to}
        onChange={(v) => update('to', v)}
        placeholder="Before date"
        aria-label="Filter to date"
      />
      <Button type="submit" size="sm" variant="secondary" className="h-8 gap-1">
        <Search className="h-3 w-3" />
        Search
      </Button>
      {hasFilters && (
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={handleClear}>
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </form>
  );
}
