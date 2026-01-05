import React, { useState } from 'react';
import {
  Type,
  Calendar,
  Mail,
  Phone,
  Hash,
  CheckSquare,
  List,
  FileText,
  ChevronDown,
  ChevronUp,
  Circle,
  DollarSign,
  PenTool
} from 'lucide-react';

const fieldTypes = [
  { type: 'label', label: 'Label/Text', icon: Type, description: 'Plain text label (read-only)' },
  { type: 'text', label: 'Text Field', icon: Type, description: 'Single line text input' },
  { type: 'textarea', label: 'Text Area', icon: FileText, description: 'Multi-line text input' },
  { type: 'email', label: 'Email', icon: Mail, description: 'Email address input' },
  { type: 'tel', label: 'Phone', icon: Phone, description: 'Phone number input' },
  { type: 'date', label: 'Date', icon: Calendar, description: 'Date picker' },
  { type: 'number', label: 'Number', icon: Hash, description: 'Numeric input (with currency/computation)' },
  { type: 'select', label: 'Select', icon: List, description: 'Dropdown selection' },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, description: 'Checkbox with conditional logic' },
  { type: 'radio', label: 'Radio', icon: Circle, description: 'Radio button group' },
  { type: 'signature', label: 'Signature', icon: PenTool, description: 'Signature field (draw or upload)' }
];

export default function FieldPalette({ onAddField, activeSectionId, formStructure }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getActiveSectionName = () => {
    if (!activeSectionId || !formStructure?.sections) return null;
    const section = formStructure.sections.find(s => s.id === activeSectionId);
    return section?.title || null;
  };

  const activeSectionName = getActiveSectionName();

  return (
    <div className="w-full">

      {/* Mobile: Collapsible */}
      <div className="sm:hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-medium text-gray-900">Field Types</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>
        {isExpanded && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {fieldTypes.map((fieldType) => {
              const Icon = fieldType.icon;
              return (
                <button
                  key={fieldType.type}
                  onClick={() => {
                    onAddField(fieldType.type);
                    setIsExpanded(false);
                  }}
                  className="flex flex-col items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-95"
                >
                  <Icon className="w-5 h-5 text-gray-600" />
                  <span className="text-xs font-medium text-gray-900">{fieldType.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop: Always Visible */}
      <div className="hidden sm:block">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Field Types
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {fieldTypes.map((fieldType) => {
            const Icon = fieldType.icon;
            return (
              <button
                key={fieldType.type}
                onClick={() => onAddField(fieldType.type)}
                className="flex flex-col items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all group"
                title={fieldType.description}
              >
                <Icon className="w-5 h-5 text-gray-600 group-hover:text-blue-600 transition-colors" />
                <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  {fieldType.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

