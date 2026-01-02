import React, { useState, useRef } from 'react';
import {
  Plus,
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronRight,
  FileText,
  X,
  Settings
} from 'lucide-react';
import FieldPalette from './FieldPalette';
import SectionConfigurationPanel from './SectionConfigurationPanel';

export default function FormBuilderPanel({
  formStructure,
  selectedField,
  activeSectionId,
  onFieldSelect,
  onFieldUpdate,
  onFieldDelete,
  onFieldReorder,
  onAddField,
  onSectionUpdate,
  onAddSection,
  onActiveSectionChange,
  onSectionSelect
}) {
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [draggedField, setDraggedField] = useState(null);
  const [draggedFieldIndex, setDraggedFieldIndex] = useState(null);
  const [draggedSectionId, setDraggedSectionId] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const isDraggingRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const toggleSection = (sectionId) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
      // Set as active section when expanded
      if (onActiveSectionChange) {
        onActiveSectionChange(sectionId);
      }
    }
    setExpandedSections(newExpanded);
  };

  const handleSectionClick = (sectionId) => {
    // Set as active section when clicked
    if (onActiveSectionChange) {
      onActiveSectionChange(sectionId);
    }
    toggleSection(sectionId);
  };

  const handleDragStart = (e, field, fieldIndex, sectionId) => {
    setDraggedField(field);
    setDraggedFieldIndex(fieldIndex);
    setDraggedSectionId(sectionId);
    isDraggingRef.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
    // Add visual feedback
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDrag = (e) => {
    // Check if mouse has moved enough to consider it a drag
    const deltaX = Math.abs(e.clientX - dragStartPos.current.x);
    const deltaY = Math.abs(e.clientY - dragStartPos.current.y);
    if (deltaX > 5 || deltaY > 5) {
      isDraggingRef.current = true;
    }
  };

  const handleDragEnd = (e) => {
    // Reset visual feedback
    e.currentTarget.style.opacity = '1';
    const wasDragging = isDraggingRef.current;
    setDraggedField(null);
    setDraggedFieldIndex(null);
    setDraggedSectionId(null);
    setDragOverIndex(null);
    isDraggingRef.current = false;
    dragStartPos.current = { x: 0, y: 0 };
    
    // If it was a drag, prevent click event by using a small timeout
    if (wasDragging) {
      // Prevent click from firing after drag
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 100);
    }
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetIndex, sectionId) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedField && draggedSectionId === sectionId && draggedFieldIndex !== null) {
      // Only reorder if within the same section
      if (draggedFieldIndex !== targetIndex && onFieldReorder) {
        onFieldReorder(sectionId, draggedFieldIndex, targetIndex);
      }
    }
    
    setDraggedField(null);
    setDraggedFieldIndex(null);
    setDraggedSectionId(null);
    setDragOverIndex(null);
  };

  const handleAddSection = () => {
    if (onAddSection) {
      onAddSection();
    }
  };


  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Field Palette - Mobile: Collapsible, Desktop: Always Visible */}
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <FieldPalette 
          onAddField={(fieldType) => onAddField(fieldType, activeSectionId)} 
          activeSectionId={activeSectionId}
          formStructure={formStructure}
        />
      </div>

      {/* Form Structure */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {formStructure.sections.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sections yet</h3>
            <p className="text-gray-600 mb-6">Add a section to start building your form</p>
            <button
              onClick={handleAddSection}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Section
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {formStructure.sections.map((section, sectionIndex) => {
              const isExpanded = expandedSections.has(section.id);
              
              return (
                <div
                  key={section.id}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm group"
                >
                  {/* Section Header */}
                  <div
                    className={`flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      activeSectionId === section.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                    onClick={() => handleSectionClick(section.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>
                      <h3 
                        className="font-semibold text-gray-900 truncate flex-1"
                        title={`Section ID: ${section.id}`}
                      >
                        {section.title || `Section ${sectionIndex + 1}`}
                      </h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(section.id);
                          // Show temporary feedback
                          const btn = e.currentTarget;
                          const originalText = btn.textContent;
                          btn.textContent = 'Copied!';
                          btn.className = btn.className.replace('text-gray-400', 'text-green-600');
                          setTimeout(() => {
                            btn.textContent = originalText;
                            btn.className = btn.className.replace('text-green-600', 'text-gray-400');
                          }, 2000);
                        }}
                        className="text-xs text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
                        title={`Click to copy Section ID: ${section.id}`}
                      >
                        {section.id}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSectionSelect) {
                            onSectionSelect(section);
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Configure section"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {section.fields?.length || 0} field{(section.fields?.length || 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Section Fields */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4 space-y-2">
                      {section.fields && section.fields.length > 0 ? (
                        section.fields.map((field, fieldIndex) => {
                          const isSelected = selectedField?.id === field.id;
                          
                          return (
                            <div
                              key={field.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, field, fieldIndex, section.id)}
                              onDrag={handleDrag}
                              onDragEnd={handleDragEnd}
                              onDragOver={(e) => {
                                e.preventDefault();
                                handleDragOver(e, fieldIndex);
                              }}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, fieldIndex, section.id)}
                              onClick={(e) => {
                                // Only select if it wasn't a drag
                                if (!isDraggingRef.current) {
                                  onFieldSelect(field);
                                } else {
                                  // Reset after a short delay
                                  setTimeout(() => {
                                    isDraggingRef.current = false;
                                  }, 0);
                                }
                              }}
                              className={`
                                flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-move
                                ${isSelected
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }
                                ${dragOverIndex === fieldIndex && draggedField ? 'border-blue-400 bg-blue-100' : ''}
                                ${draggedFieldIndex === fieldIndex && draggedSectionId === section.id ? 'opacity-50' : ''}
                              `}
                            >
                              <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium text-gray-900 truncate">
                                    {field.label || 'Unnamed Field'}
                                  </span>
                                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                    {field.type}
                                  </span>
                                  {field.required && (
                                    <span className="text-xs text-red-600 font-medium">*</span>
                                  )}
                                </div>
                                {field.key && (
                                  <p className="text-xs text-gray-500 truncate">
                                    Key: {field.key}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onFieldDelete(field.id);
                                }}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                                title="Delete field"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-6 text-gray-500 text-sm">
                          No fields in this section. Add fields from the palette above.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add Section Button */}
        {formStructure.sections.length > 0 && (
          <button
            onClick={handleAddSection}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">Add Section</span>
          </button>
        )}
      </div>
    </div>
  );
}

