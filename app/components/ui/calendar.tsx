'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-2',
        month_caption: 'relative flex justify-center items-center h-8',
        caption_label: 'text-sm font-medium',
        nav: 'absolute inset-x-0 flex items-center justify-between pointer-events-none',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 pointer-events-auto',
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 pointer-events-auto',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground w-9 font-normal text-[0.8rem] text-center pb-1',
        weeks: 'w-full',
        week: 'flex w-full mt-1',
        day: 'relative h-9 w-9 p-0 text-center [&>button]:hover:bg-accent [&>button]:hover:text-accent-foreground [&[data-selected]>button]:bg-primary [&[data-selected]>button]:text-primary-foreground [&[data-selected]>button]:hover:bg-primary [&[data-selected]>button]:hover:text-primary-foreground [&[data-today]>button]:bg-accent [&[data-today]>button]:text-accent-foreground [&[data-outside]>button]:text-muted-foreground [&[data-outside]>button]:opacity-50 [&[data-disabled]>button]:opacity-50',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal',
        ),
        selected: '',
        today: '',
        outside: '',
        disabled: '',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left'
            ? <ChevronLeft className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}

Calendar.displayName = 'Calendar';

export { Calendar };
