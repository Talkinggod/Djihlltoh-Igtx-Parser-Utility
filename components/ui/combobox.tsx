
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

interface Option {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onCreate?: (label: string) => void;
  placeholder?: string;
  className?: string;
}

export const Combobox: React.FC<ComboboxProps> = ({ options, value, onChange, onCreate, placeholder = "Select...", className }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
        if (open && containerRef.current) {
             const rect = containerRef.current.getBoundingClientRect();
             setCoords({
                 top: rect.bottom + window.scrollY + 4,
                 left: rect.left + window.scrollX,
                 width: rect.width
             });
        }
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    
    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCoords({
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width
        });
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
          containerRef.current && 
          !containerRef.current.contains(event.target as Node) &&
          listRef.current &&
          !listRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = query === "" 
    ? options 
    : options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

  const selectedLabel = options.find((opt) => opt.value === value)?.label || value;

  const handleSelect = (val: string) => {
      onChange(val);
      setOpen(false);
      setQuery("");
  };

  const handleCreate = () => {
      if (onCreate && query) {
          onCreate(query);
          setOpen(false);
          setQuery("");
      }
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between font-normal text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      
      {open && createPortal(
        <div 
            ref={listRef}
            style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                width: coords.width,
                zIndex: 9999
            }}
            className="rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
           <div className="p-1">
             <input
               className="w-full border-b bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
               placeholder="Search or type new..."
               value={query}
               onChange={(e) => setQuery(e.target.value)}
               autoFocus
             />
           </div>
           <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
             {filteredOptions.length === 0 && !query && (
               <p className="p-2 text-sm text-muted-foreground text-center">Start typing...</p>
             )}
             
             {filteredOptions.map((option) => (
               <div
                 key={option.value}
                 className={cn(
                   "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer",
                   value === option.value && "bg-accent text-accent-foreground"
                 )}
                 onClick={() => handleSelect(option.value)}
               >
                 <Check
                   className={cn(
                     "mr-2 h-4 w-4",
                     value === option.value ? "opacity-100" : "opacity-0"
                   )}
                 />
                 {option.label}
               </div>
             ))}

             {onCreate && query && filteredOptions.length === 0 && (
                <div
                    className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground text-primary font-medium"
                    onClick={handleCreate}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Create "{query}"
                </div>
             )}
           </div>
        </div>,
        document.body
      )}
    </div>
  );
};
