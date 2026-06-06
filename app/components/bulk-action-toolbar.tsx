'use client';

import { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Trash2, MailOpen, Mail, ArchiveX } from 'lucide-react';

interface BulkActionToolbarProps {
  totalCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
  onJunk?: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
}

export function BulkActionToolbar({
  totalCount,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onJunk,
  onMarkRead,
  onMarkUnread,
}: BulkActionToolbarProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const someSelected = selectedCount > 0 && selectedCount < totalCount;
  const hasSelection = selectedCount > 0;

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function handleChange() {
    if (allSelected || someSelected) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 border-b px-3 h-10 shrink-0 justify-between">
      <div className="flex items-center gap-0.5">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={handleChange}
          className="h-4 w-4 rounded cursor-pointer accent-primary mr-2"
          aria-label="Select all emails"
          data-testid="select-all-checkbox"
        />
        {hasSelection && (
          <span className="text-xs text-muted-foreground mr-1" data-testid="selection-count">
            {selectedCount} selected
          </span>
        )}
      </div>


      <div className="flex items-center gap-1"> 

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onDelete}
              disabled={!hasSelection}
              data-testid="bulk-delete-button"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
        {onJunk !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onJunk}
                disabled={!hasSelection}
                data-testid="bulk-junk-button"
              >
                <ArchiveX className="h-4 w-4" />
                <span className="sr-only">Junk</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Junk</TooltipContent>
          </Tooltip>
        )}
        {onMarkRead !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onMarkRead}
                disabled={!hasSelection}
                data-testid="bulk-mark-read-button"
              >
                <MailOpen className="h-4 w-4" />
                <span className="sr-only">Mark read</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mark read</TooltipContent>
          </Tooltip>
        )}
        {onMarkUnread !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onMarkUnread}
                disabled={!hasSelection}
                data-testid="bulk-mark-unread-button"
              >
                <Mail className="h-4 w-4" />
                <span className="sr-only">Mark unread</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mark unread</TooltipContent>
          </Tooltip>
        )}
      </div>
        
      </div>
    </TooltipProvider>
  );
}
