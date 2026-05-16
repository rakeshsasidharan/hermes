'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', className, 'aria-label': ariaLabel }: DatePickerProps) {
  const date = value ? new Date(value + 'T00:00:00') : undefined;

  function handleSelect(selected: Date | undefined) {
    onChange(selected ? format(selected, 'yyyy-MM-dd') : '');
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={ariaLabel}
          className={cn('h-8 w-40 justify-start text-left font-normal text-sm px-2', !value && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="h-3.5 w-3.5 mr-1.5 shrink-0" />
          {value ? format(new Date(value + 'T00:00:00'), 'MMM d, yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
}
