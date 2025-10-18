import React, { useState, useEffect } from 'react';
import './App.css';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';

interface HazardCategory {
  id: number;
  name: string;
  hazard_class: string;
  subclass?: string;
  description?: string;
  logo_path?: string;
}

interface HazardPairData {
  hazard_category_a_id: number;
  hazard_category_b_id: number;
  distance: number;
}

interface ContainerData {
  id: number;
  department: string;
  location: string;
  submitted_by: string;
  container: string;
  container_type: string;
  submitted_at: string;
  status: string;
  approval_comment?: string;
  approved_by?: string;
  approved_at?: string;
  hazards: Array<{name: string, hazard_class: string}>;
  pairs: Array<{
    id: number;
    hazard_a_name: string;
    hazard_b_name: string;
    distance: number;
    is_isolated: boolean;
    min_required_distance: number;
    status: string;
  }>;
}

interface MatrixCell {
  hazard_a_id: number;
  hazard_b_id: number;
  status: string;
  is_isolated: boolean;
  min_required_distance: number | null;
  compatibility_type: string;
}

interface User {
  id: number;
  email: string;
  name: string;
  role: 'hod' | 'admin' | 'user' | 'viewer';
  department: string;
  active: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface DeletionRequest {
  id: number;
  container_id: number;
  container: string;
  department: string;
  location: string;
  container_type: string;
  container_status: string;
  submitted_by: string;
  submitted_at: string;
  requested_by: string;
  requested_by_email: string;
  request_reason: string;
  request_date: string;
  admin_reviewed: boolean;
  admin_reviewer?: string;
  admin_review_comment?: string;
  admin_review_date?: string;
}

interface AnalyticsData {
  id: number;
  department: string;
  location: string;
  submitted_by: string;
  container_type: string;
  submitted_at: string;
  status: string;
  hazards: Array<{name: string, hazard_class: string}>;
}

// const API_BASE = 'http://localhost:8000';
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

// ADD THESE CONSTANTS HERE:
// Predefined department list
const DEPARTMENTS = [
  'Environment',
  'Project',
  'External Relations',
  'Human Resources',
  'Community Relations',
  'Site Power and Electrical',
  'Health & Safety',
  'IT',
  'Finance',
  'Mobile Maintenance',
  'Support Services',
  'Technical Services'
];

// ADD THIS NEW MAPPING
const DEPARTMENT_ABBREV: { [key: string]: string } = {
  'Environment': 'ENV',
  'Project': 'PRO',
  'External Relations': 'ER',
  'Human Resources': 'HR',
  'Community Relations': 'CR',
  'Site Power and Electrical': 'POW',
  'Health & Safety': 'H&S',
  'IT': 'IT',
  'Finance': 'FIN',
  'Mobile Maintenance': 'MEM',
  'Support Services': 'SS',
  'Technical Services': 'TSE'
};

// Function to generate container ID
const generateContainerID = async (department: string): Promise<string> => {
  // Check if department is selected
  if (!department) {
    return ''; // Return empty if no department selected
  }

  const deptAbbrev = DEPARTMENT_ABBREV[department] || 'UNK';
  
  try {
    const response = await fetch(`${API_BASE}/generate-container-id/?department=${encodeURIComponent(deptAbbrev)}`);
    if (response.ok) {
      const data = await response.json();
      return data.container_id;
    }
  } catch (error) {
    console.error('Error generating container ID:', error);
  }
  
  // Fallback generation with department
  const randomNum = String(Math.floor(1000 + Math.random() * 9000)); // 4 digits
  return `CONT-${randomNum}-${deptAbbrev}`;
};

// Popup Compatibility Matrix Component
const PopupCompatibilityMatrix: React.FC<{
  selectedHazards: HazardCategory[];
  allHazards: HazardCategory[];
  isOpen: boolean;
  onClose: () => void;
}> = ({ selectedHazards, allHazards, isOpen, onClose }) => {
  const [matrixData, setMatrixData] = useState<MatrixCell[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && selectedHazards.length > 0) {
      generateFullMatrix();
    }
  }, [isOpen, selectedHazards, allHazards]);

  const generateFullMatrix = async () => {
    setLoading(true);
    const data: MatrixCell[] = [];

    // Generate matrix for all selected hazards vs all hazard categories
    for (const selectedHazard of selectedHazards) {
      for (const otherHazard of allHazards) {
        // if (otherHazard.id === selectedHazard.id) {
          // Same hazard
          // data.push({
          //   hazard_a_id: selectedHazard.id,
          //   hazard_b_id: otherHazard.id,
          //   status: 'safe',
          //   is_isolated: false,
          //   min_required_distance: 3.0,
          //   compatibility_type: 'SAME TYPE'
          // });
        // } else {
          try {
            const response = await fetch(
              `${API_BASE}/preview-status/?hazard_a_id=${selectedHazard.id}&hazard_b_id=${otherHazard.id}&distance=0`,
              { method: 'POST' }
            );
            
            if (response.ok) {
              const statusData = await response.json();
              
              let compatibilityType = 'COMPATIBLE';
              if (statusData.is_isolated) {
                compatibilityType = 'MUST BE ISOLATED';
              } else if (statusData.min_required_distance >= 20) {
                compatibilityType = 'INCOMPATIBLE';
              } else if (selectedHazard.id === otherHazard.id) {
                compatibilityType = 'SAME TYPE';
              } 
              else if (statusData.min_required_distance < 3) {
                compatibilityType = 'OK';
              }

              data.push({
                hazard_a_id: selectedHazard.id,
                hazard_b_id: otherHazard.id,
                status: statusData.status,
                is_isolated: statusData.is_isolated,
                min_required_distance: statusData.min_required_distance,
                compatibility_type: compatibilityType
              });
            }
          } catch (error) {
            console.error('Error fetching compatibility data:', error);
            data.push({
              hazard_a_id: selectedHazard.id,
              hazard_b_id: otherHazard.id,
              status: 'unknown',
              is_isolated: false,
              min_required_distance: null,
              compatibility_type: 'UNKNOWN'
            });
          }
        // }
      }
    }

    setMatrixData(data);
    setLoading(false);
  };

  const getCompatibilityColor = (cell: MatrixCell) => {
    if (cell.hazard_a_id === cell.hazard_b_id) {
      return { backgroundColor: '#E3F2FD', borderColor: '#2196F3', textColor: '#1565C0' };
    }
    
    switch (cell.compatibility_type) {
      case 'MUST BE ISOLATED':
        return { backgroundColor: '#FFEBEE', borderColor: '#F44336', textColor: '#C62828' };
      case 'INCOMPATIBLE':
        return { backgroundColor: '#FFF3E0', borderColor: '#FF9800', textColor: '#E65100' };
      case 'SAME TYPE':
        return { backgroundColor: '#FFF8E1', borderColor: '#FFC107', textColor: '#F57F17' };
      case 'COMPATIBLE':
        return { backgroundColor: '#E8F5E8', borderColor: '#4CAF50', textColor: '#2E7D32' };
      default:
        return { backgroundColor: '#F5F5F5', borderColor: '#9E9E9E', textColor: '#424242' };
    }
  };

  const getDistanceText = (cell: MatrixCell) => {
    if (cell.is_isolated) return '∞';
    if (cell.min_required_distance === null) return 'N/A';
    if (cell.min_required_distance === Infinity) return '∞';
    return `${cell.min_required_distance}m`;
  };

  const getCompatibilitySymbol = (cell: MatrixCell) => {
    switch (cell.compatibility_type) {
      case 'MUST BE ISOLATED': return '🚫';
      case 'INCOMPATIBLE': return '⚠️';
      case 'SAME TYPE': return '🔄';
      case 'COMPATIBLE': return '✅';
      case 'OK': return '✅';
      default: return '❓';
    }
  };

  const getCellData = (selectedHazardId: number, otherHazardId: number) => {
    return matrixData.find(cell => 
      cell.hazard_a_id === selectedHazardId && cell.hazard_b_id === otherHazardId
    );
  };

  if (!isOpen) return null;

  return (
    <div className="matrix-popup-overlay" onClick={onClose}>
      <div className="matrix-popup-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="matrix-popup-header">
          <h2>⚠️ Complete Hazard Compatibility Matrix</h2>
          <p>Selected hazards vs all hazard categories compatibility analysis</p>
          <button className="matrix-popup-close" onClick={onClose} aria-label="Close matrix">
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="matrix-popup-content">
          {loading ? (
            <div className="matrix-popup-loading">
              <div className="loading-spinner"></div>
              <p>Generating complete compatibility matrix...</p>
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="matrix-popup-legend">
                {[
                  { type: 'MUST BE ISOLATED', symbol: '🚫' },
                  { type: 'INCOMPATIBLE', symbol: '⚠️' },
                  { type: 'SAME TYPE', symbol: '🔄' },
                  { type: 'COMPATIBLE', symbol: '✅' }
                ].map(legend => (
                  <div key={legend.type} className="legend-item">
                    <span className="legend-symbol">{legend.symbol}</span>
                    <span className="legend-text">{legend.type}</span>
                  </div>
                ))}
              </div>

              {/* Matrix Table */}
              <div className="matrix-popup-table-container">
                <table className="matrix-popup-table">
                  {/* Column Headers */}
                  <thead>
                    <tr>
                      <th className="matrix-corner-cell">
                        <div className="corner-content">
                          <span className="corner-selected">Selected</span>
                          <span className="corner-vs">vs</span>
                          <span className="corner-all">All Hazards</span>
                        </div>
                      </th>
                      {allHazards.map(hazard => (
                        <th key={hazard.id} className="matrix-popup-column-header">
                          <div className="header-content">
                            <div className="hazard-code">Class {hazard.hazard_class}</div>
                            <div className="hazard-name">{hazard.name}</div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  {/* Matrix Data */}
                  <tbody>
                    {selectedHazards.map(selectedHazard => (
                      <tr key={selectedHazard.id}>
                        {/* Row Header */}
                        <td className="matrix-popup-row-header">
                          <div className="row-header-content">
                            <div className="hazard-code">Class {selectedHazard.hazard_class}</div>
                            <div className="hazard-name">{selectedHazard.name}</div>
                          </div>
                        </td>

                        {/* Data Cells */}
                        {allHazards.map(otherHazard => {
                          const cell = getCellData(selectedHazard.id, otherHazard.id);
                          if (!cell) return <td key={otherHazard.id} className="matrix-empty-cell">-</td>;

                          const colors = getCompatibilityColor(cell);
                          const isSelectedHazard = cell.hazard_a_id === cell.hazard_b_id;

                          return (
                            <td 
                              key={otherHazard.id} 
                              className={`matrix-popup-data-cell matrix-${cell.compatibility_type.toLowerCase().replace(/\s+/g, '-')}`}
                              style={{
                                backgroundColor: colors.backgroundColor,
                                borderColor: colors.borderColor,
                                color: colors.textColor
                              }}
                              title={`${selectedHazard.name} ↔ ${otherHazard.name}: ${cell.compatibility_type} (${getDistanceText(cell)})`}
                            >
                              <div className="cell-content">
                                <div className="cell-symbol">
                                  {getCompatibilitySymbol(cell)}
                                </div>
                                <div className="cell-type">
                                  {isSelectedHazard ? 'SAME' : cell.compatibility_type.split(' ')[0]}
                                </div>
                                <div className="cell-distance">
                                  {getDistanceText(cell)}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Statistics */}
              <div className="matrix-popup-summary">
                <h3>Compatibility Summary</h3>
                <div className="summary-grid">
                  <div className="summary-item danger">
                    <div className="summary-number">
                      {matrixData.filter(c => c.compatibility_type === 'MUST BE ISOLATED').length}
                    </div>
                    <div className="summary-label">🚫 Must Be Isolated</div>
                  </div>
                  <div className="summary-item warning">
                    <div className="summary-number">
                      {matrixData.filter(c => c.compatibility_type === 'INCOMPATIBLE').length}
                    </div>
                    <div className="summary-label">⚠️ Incompatible</div>
                  </div>
                  <div className="summary-item safe">
                    <div className="summary-number">
                      {matrixData.filter(c => c.compatibility_type === 'COMPATIBLE').length}
                    </div>
                    <div className="summary-label">✅ Compatible</div>
                  </div>
                  <div className="summary-item info">
                    <div className="summary-number">
                      {matrixData.filter(c => c.compatibility_type === 'SAME TYPE').length}
                    </div>
                    <div className="summary-label">🔄 Same Type</div>
                  </div>
                </div>

                <div className="matrix-info">
                  <p><strong>Selected Hazards:</strong> {selectedHazards.map(h => `Class ${h.hazard_class} (${h.name})`).join(', ')}</p>
                  <p><strong>Total Relationships:</strong> {matrixData.length} compatibility assessments</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Matrix Button Component
const MatrixPopupButton: React.FC<{
  selectedHazards: HazardCategory[];
  allHazards: HazardCategory[];
}> = ({ selectedHazards, allHazards }) => {
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);

  if (selectedHazards.length === 0) return null;

  return (
    <>
      <div className="matrix-popup-trigger-section">
        <div className="matrix-trigger-info">
          <h3>📊 Compatibility Matrix</h3>
          <p>View complete compatibility analysis for all selected hazards</p>
        </div>
        <button 
          className="matrix-popup-trigger-btn"
          onClick={() => setIsMatrixOpen(true)}
        >
          <span className="btn-icon">⚠️</span>
          <span className="btn-text">View Compatibility Matrix</span>
          <span className="btn-count">({selectedHazards.length} hazards)</span>
        </button>
      </div>

      <PopupCompatibilityMatrix
        selectedHazards={selectedHazards}
        allHazards={allHazards}
        isOpen={isMatrixOpen}
        onClose={() => setIsMatrixOpen(false)}
      />
    </>
  );
};

// Approval requires a comment of at least 10 characters
const ApprovalCommentModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
  type: 'approve' | 'reject';
}> = ({ isOpen, onClose, onSubmit, type }) => {
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    const trimmedComment = comment.trim();
    
    if (trimmedComment.length === 0) {
      setError('Comment is required');
      return;
    }
    
    if (trimmedComment.length < 10) {
      setError(`Comment must be at least 10 characters (current: ${trimmedComment.length})`);
      return;
    }
    
    onSubmit(trimmedComment);
    setComment('');
    setError('');
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(30, 58, 95, 0.8)',
      backdropFilter: 'blur(5px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ 
          margin: '0 0 1rem 0', 
          color: type === 'approve' ? '#4caf50' : '#f44336' 
        }}>
          {type === 'approve' ? '✅ Approve Container' : '❌ Reject Container'}
        </h3>
        
        <p style={{ margin: '0 0 1.5rem 0', color: '#666', fontSize: '0.95rem' }}>
          Please provide a detailed comment explaining your decision (minimum 10 characters):
        </p>
        
        <textarea
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setError('');
          }}
          placeholder={
            type === 'approve' 
              ? 'Example: All hazard distances meet safety requirements. Container layout approved for storage in designated area.'
              : 'Example: Flammable liquid and oxidizer distances insufficient. Requires minimum 5m separation per DOT regulations.'
          }
          style={{
            width: '100%',
            minHeight: '120px',
            padding: '1rem',
            border: error ? '2px solid #f44336' : '2px solid #ccc',
            borderRadius: '6px',
            fontSize: '1rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            marginBottom: '0.5rem',
            boxSizing: 'border-box'
          }}
          autoFocus
        />
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <span style={{ 
            fontSize: '0.85rem', 
            color: comment.trim().length < 10 ? '#f44336' : '#4caf50' 
          }}>
            {comment.trim().length} / 10 characters minimum
          </span>
          {error && <span style={{ fontSize: '0.85rem', color: '#f44336' }}>{error}</span>}
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              color: '#666',
              border: '2px solid #ccc',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={comment.trim().length < 10}
            style={{
              padding: '0.75rem 1.5rem',
              background: type === 'approve' ? '#4caf50' : '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: comment.trim().length < 10 ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              opacity: comment.trim().length < 10 ? 0.5 : 1
            }}
          >
            {type === 'approve' ? 'Approve Container' : 'Reject Container'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DeletionRequestModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  containerName: string;
}> = ({ isOpen, onClose, onSubmit, containerName }) => {
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    const trimmedReason = reason.trim();
    
    if (trimmedReason.length === 0) {
      setError('Deletion reason is required');
      return;
    }
    
    if (trimmedReason.length < 20) {
      setError(`Reason must be at least 20 characters (current: ${trimmedReason.length})`);
      return;
    }
    
    onSubmit(trimmedReason);
    setReason('');
    setError('');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(30, 58, 95, 0.8)',
      backdropFilter: 'blur(5px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ 
          margin: '0 0 1rem 0', 
          color: '#f44336',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          🗑️ Request Container Deletion
        </h3>
        
        <div style={{
          background: '#fff3e0',
          border: '2px solid #ff9800',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <p style={{ margin: 0, color: '#e65100', fontWeight: '600', fontSize: '0.95rem' }}>
            <strong>Container:</strong> {containerName}
          </p>
          <p style={{ margin: '0.5rem 0 0 0', color: '#f57c00', fontSize: '0.85rem' }}>
            This request will be sent to the Head of Department (HOD) for approval.
          </p>
        </div>
        
        <p style={{ margin: '0 0 1rem 0', color: '#666', fontSize: '0.95rem' }}>
          Please provide a detailed reason for deletion (minimum 20 characters):
        </p>
        
        <textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError('');
          }}
          placeholder="Example: Container assessment was submitted in error. The chemicals listed are not present at this location and the assessment needs to be removed from the system."
          style={{
            width: '100%',
            minHeight: '120px',
            padding: '1rem',
            border: error ? '2px solid #f44336' : '2px solid #ccc',
            borderRadius: '6px',
            fontSize: '1rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            marginBottom: '0.5rem',
            boxSizing: 'border-box'
          }}
          autoFocus
        />
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <span style={{ 
            fontSize: '0.85rem', 
            color: reason.trim().length < 20 ? '#f44336' : '#4caf50' 
          }}>
            {reason.trim().length} / 20 characters minimum
          </span>
          {error && <span style={{ fontSize: '0.85rem', color: '#f44336' }}>{error}</span>}
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              onClose();
              setReason('');
              setError('');
            }}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              color: '#666',
              border: '2px solid #ccc',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={reason.trim().length < 20}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: reason.trim().length < 20 ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              opacity: reason.trim().length < 20 ? 0.5 : 1
            }}
          >
            Submit Deletion Request
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminReviewModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string, recommendation: 'approve' | 'reject') => void;
  request: DeletionRequest | null;
}> = ({ isOpen, onClose, onSubmit, request }) => {
  const [comment, setComment] = React.useState('');
  const [recommendation, setRecommendation] = React.useState<'approve' | 'reject'>('approve');
  const [error, setError] = React.useState('');

  if (!isOpen || !request) return null;

  const handleSubmit = () => {
    const trimmedComment = comment.trim();
    
    if (trimmedComment.length === 0) {
      setError('Admin review comment is required');
      return;
    }
    
    if (trimmedComment.length < 10) {
      setError(`Comment must be at least 10 characters (current: ${trimmedComment.length})`);
      return;
    }
    
    onSubmit(trimmedComment, recommendation);
    setComment('');
    setRecommendation('approve');
    setError('');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(30, 58, 95, 0.8)',
      backdropFilter: 'blur(5px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '700px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ 
          margin: '0 0 1rem 0', 
          color: 'var(--kinross-navy)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          📋 Admin Review - Deletion Request
        </h3>

        {/* Request Details */}
        <div style={{
          background: 'var(--kinross-light-gray)',
          border: '2px solid var(--kinross-medium-gray)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: 'var(--kinross-navy)' }}>
            <strong>Container:</strong> {request.container}
          </p>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
            <strong>Requested by:</strong> {request.requested_by}
          </p>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
            <strong>Department:</strong> {request.department}
          </p>
          <p style={{ margin: '0', fontSize: '0.85rem', fontStyle: 'italic' }}>
            <strong>User's Reason:</strong><br />
            {request.request_reason}
          </p>
        </div>
        
        {/* Admin Recommendation */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.75rem', 
            fontWeight: '600',
            color: 'var(--kinross-navy)'
          }}>
            Your Recommendation to HOD:
          </label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{
              flex: 1,
              padding: '1rem',
              border: recommendation === 'approve' ? '3px solid #4caf50' : '2px solid #ccc',
              borderRadius: '8px',
              cursor: 'pointer',
              background: recommendation === 'approve' ? '#e8f5e9' : 'white',
              transition: 'all 0.3s ease'
            }}>
              <input
                type="radio"
                name="recommendation"
                value="approve"
                checked={recommendation === 'approve'}
                onChange={(e) => setRecommendation('approve')}
                style={{ marginRight: '0.5rem' }}
              />
              <strong style={{ color: '#4caf50' }}>✅ Recommend Approval</strong>
            </label>
            <label style={{
              flex: 1,
              padding: '1rem',
              border: recommendation === 'reject' ? '3px solid #f44336' : '2px solid #ccc',
              borderRadius: '8px',
              cursor: 'pointer',
              background: recommendation === 'reject' ? '#ffebee' : 'white',
              transition: 'all 0.3s ease'
            }}>
              <input
                type="radio"
                name="recommendation"
                value="reject"
                checked={recommendation === 'reject'}
                onChange={(e) => setRecommendation('reject')}
                style={{ marginRight: '0.5rem'}}              
              />
              <strong style={{ color: '#f44336' }}>❌ Recommend Rejection</strong>
            </label>
          </div>
        </div>
        
        <p style={{ margin: '0 0 1rem 0', color: '#666', fontSize: '0.95rem' }}>
          Provide your detailed review and recommendation (minimum 10 characters):
        </p>
        
        <textarea
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setError('');
          }}
          placeholder={
            recommendation === 'approve' 
              ? 'Example: I have reviewed the deletion request. The user\'s reason is valid - the container was submitted in error. I recommend approval for deletion.'
              : 'Example: I have reviewed the deletion request. The container contains active chemicals in storage. I recommend rejection of this deletion request.'
          }
          style={{
            width: '100%',
            minHeight: '120px',
            padding: '1rem',
            border: error ? '2px solid #f44336' : '2px solid #ccc',
            borderRadius: '6px',
            fontSize: '1rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            marginBottom: '0.5rem',
            boxSizing: 'border-box'
          }}
          autoFocus
        />
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <span style={{ 
            fontSize: '0.85rem', 
            color: comment.trim().length < 10 ? '#f44336' : '#4caf50' 
          }}>
            {comment.trim().length} / 10 characters minimum
          </span>
          {error && <span style={{ fontSize: '0.85rem', color: '#f44336' }}>{error}</span>}
        </div>

        <div style={{
          background: '#fff3e0',
          border: '2px solid #ff9800',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#e65100' }}>
            ⚠️ <strong>Note:</strong> Your review will be forwarded to the HOD for final decision. 
            The HOD will see your recommendation and comments.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              onClose();
              setComment('');
              setRecommendation('approve');
              setError('');
            }}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              color: '#666',
              border: '2px solid #ccc',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={comment.trim().length < 10}
            style={{
              padding: '0.75rem 1.5rem',
              background: recommendation === 'approve' ? '#4caf50' : '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: comment.trim().length < 10 ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              opacity: comment.trim().length < 10 ? 0.5 : 1
            }}
          >
            Submit Review to HOD
          </button>
        </div>
      </div>
    </div>
  );
};

const DonutChart: React.FC<{
  data: Array<{name: string, value: number}>;
  title: string;
  colors: string[];
}> = ({ data, title, colors }) => {
  const [showModal, setShowModal] = React.useState(false);

  // Filter out zero values for display, but keep track of original indices
  const displayData = data.map((item, idx) => ({ ...item, originalIndex: idx })).filter(item => item.value > 0);

  if (displayData.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        background: 'var(--kinross-light-gray)',
        borderRadius: '10px'
      }}>
        <p style={{ color: 'var(--kinross-dark-gray)' }}>No data available</p>
      </div>
    );
  }

  const total = displayData.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = -90;

  const createSlicePath = (startAngle: number, endAngle: number) => {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const outerRadius = 90;
    const innerRadius = 50;

    const x1 = 100 + outerRadius * Math.cos(startRad);
    const y1 = 100 + outerRadius * Math.sin(startRad);
    const x2 = 100 + outerRadius * Math.cos(endRad);
    const y2 = 100 + outerRadius * Math.sin(endRad);
    const x3 = 100 + innerRadius * Math.cos(endRad);
    const y3 = 100 + innerRadius * Math.sin(endRad);
    const x4 = 100 + innerRadius * Math.cos(startRad);
    const y4 = 100 + innerRadius * Math.sin(startRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  };

  // Calculate label positions for lines extending from chart
  const getLabelPosition = (startAngle: number, endAngle: number, index: number) => {
    const midAngle = (startAngle + endAngle) / 2;
    const midRad = (midAngle * Math.PI) / 180;
    
    // Point on outer edge of donut
    const innerX = 100 + 90 * Math.cos(midRad);
    const innerY = 100 + 90 * Math.sin(midRad);
    
    // Extended point for line
    const outerX = 100 + 130 * Math.cos(midRad);
    const outerY = 100 + 130 * Math.sin(midRad);
    
    return { innerX, innerY, outerX, outerY, midAngle };
  };

  const chartContent = () => {
    let angleTracker = -90;
    
    return (
      <svg width="300" height="300" viewBox="0 0 300 300">
        {/* Draw donut slices */}
        {displayData.map((item, idx) => {
          const percentage = (item.value / total) * 100;
          const angle = (percentage / 100) * 360;
          const startAngle = angleTracker;
          const endAngle = angleTracker + angle;

          // Use originalIndex for color to maintain correct mapping
          const colorIndex = item.originalIndex !== undefined ? item.originalIndex : idx;
          
          // Translate path to center of larger viewBox
          const path = createSlicePath(startAngle, endAngle).replace(/(\d+)/g, (match) => {
            const num = parseFloat(match);
            return String(num + 50); // Offset to center in 300x300 viewBox
          });
          
          const labelPos = getLabelPosition(startAngle, endAngle, idx);
          
          angleTracker += angle;

          return (
            <g key={idx}>
              {/* Slice */}
              <path
                d={createSlicePath(startAngle, endAngle)}
                fill={colors[colorIndex % colors.length]}  // ✅ Use originalIndex
                stroke="white"
                strokeWidth="2"
                transform="translate(50, 50)"
                style={{ transition: 'opacity 0.3s' }}
              >
                <title>{`${item.name}: ${item.value} (${percentage.toFixed(1)}%)`}</title>
              </path>
              
              {/* Line from slice to label */}
              <line
                x1={labelPos.innerX + 50}
                y1={labelPos.innerY + 50}
                x2={labelPos.outerX + 50}
                y2={labelPos.outerY + 50}
                stroke={colors[colorIndex % colors.length]}  // ✅ Use originalIndex
                strokeWidth="2"
              />
              
              {/* Percentage label */}
              <text
                x={labelPos.outerX + 50 + (labelPos.midAngle > 90 && labelPos.midAngle < 270 ? -10 : 10)}
                y={labelPos.outerY + 50}
                textAnchor={labelPos.midAngle > 90 && labelPos.midAngle < 270 ? 'end' : 'start'}
                dominantBaseline="middle"
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  fill: colors[colorIndex % colors.length]  // ✅ Use originalIndex
                }}
              >
                {percentage.toFixed(1)}%
              </text>
            </g>
          );
        })}
        
        {/* Center text */}
        <text
          x="150"
          y="145"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontSize: '32px',
            fontWeight: '700',
            fill: 'var(--kinross-navy)'
          }}
        >
          {total}
        </text>
        <text
          x="150"
          y="165"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontSize: '14px',
            fill: 'var(--kinross-dark-gray)'
          }}
        >
          Total
        </text>
      </svg>
    );
  };

  return (
    <>
      {/* Compact Card View */}
      <div 
        style={{
          background: 'var(--kinross-white)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 4px 15px rgba(30, 58, 95, 0.1)',
          border: '1px solid var(--kinross-medium-gray)',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          textAlign: 'center'
        }}
        onClick={() => setShowModal(true)}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 8px 25px rgba(30, 58, 95, 0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 15px rgba(30, 58, 95, 0.1)';
        }}
      >
        <h3 style={{
          color: 'var(--kinross-navy)',
          marginBottom: '1rem',
          fontSize: '1.3rem'
        }}>
          {title}
        </h3>
        
        {chartContent()}
        
        <div style={{
          marginTop: '1rem',
          fontSize: '0.85rem',
          color: 'var(--kinross-dark-gray)',
          fontStyle: 'italic'
        }}>
          👆 Click to view details
        </div>
      </div>

      {/* Modal Popup */}
      {showModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(30, 58, 95, 0.85)',
            backdropFilter: 'blur(5px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            animation: 'fadeIn 0.3s ease'
          }}
          onClick={() => setShowModal(false)}
        >
          <div 
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: '2px solid var(--kinross-gold)',
              animation: 'slideIn 0.3s ease'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, var(--kinross-navy), var(--kinross-dark-navy))',
              color: 'white',
              padding: '1.5rem',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px',
              position: 'relative'
            }}>
              <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{title}</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: 'rgba(255,255,255,0.2)',
                  border: '2px solid rgba(255,255,255,0.3)',
                  color: 'white',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'rotate(90deg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.transform = 'rotate(0deg)';
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '2rem' }}>
              <div style={{
                display: 'flex',
                gap: '3rem',
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}>
                {/* Chart */}
                <div>
                  {chartContent()}
                </div>

                {/* Legend */}
                <div style={{ flex: 1, minWidth: '250px', maxWidth: '400px' }}>
                  {displayData.map((item, idx) => {
                    const colorIndex = item.originalIndex !== undefined ? item.originalIndex : idx;
                    return (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        background: 'var(--kinross-light-gray)',
                        border: `2px solid ${colors[colorIndex % colors.length]}20`
                      }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          background: colors[colorIndex % colors.length],  // ✅ Use originalIndex
                          flexShrink: 0
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontSize: '1rem', 
                            fontWeight: '600', 
                            color: 'var(--kinross-navy)',
                            marginBottom: '0.25rem'
                          }}>
                            {item.name}
                          </div>
                          <div style={{ 
                            fontSize: '0.9rem', 
                            color: 'var(--kinross-dark-gray)',
                            display: 'flex',
                            gap: '1rem'
                          }}>
                            <span><strong>Count:</strong> {item.value}</span>
                            <span><strong>Percentage:</strong> {((item.value / total) * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Add this function before the App component
const generateContainerPDF = async (container: ContainerData, hazardCategories: HazardCategory[]) => {
  try {
    // Generate QR Code first
    const containerDetailURL = `${API_BASE}/container-pdf/${container.id}`;
    const qrCodeDataURL = await QRCode.toDataURL(containerDetailURL, {
      width: 330,
      margin: 2,
      color: {
        dark: '#D4A553',
        light: '#FFFFFF'
      }
    });

    // Create a hidden container for PDF generation - A3 landscape size
    const pdfContainer = document.createElement('div');
    pdfContainer.style.position = 'absolute';
    pdfContainer.style.left = '-9999px';
    pdfContainer.style.width = '3508px';
    pdfContainer.style.height = '2480px';
    pdfContainer.style.background = 'white';
    pdfContainer.style.padding = '0';
    pdfContainer.style.margin = '0';
    
    // Map hazard names to IDs for checkbox marking
    const selectedHazardIds = container.hazards.map(h => {
      const hazard = hazardCategories.find(hc => hc.name === h.name);
      return hazard ? hazard.id : 0;
    }).filter(id => id > 0);

    // Build HTML matching your A3 template
    pdfContainer.innerHTML = `
      <div style="font-family: Arial, sans-serif; background: black; color: white; 
                  width: 3508px; height: 2480px; padding: 100px; box-sizing: border-box; position: relative;">
        
        <!-- Container ID -->
        <div style="margin-bottom: 55px; display: flex; align-items: center; gap: 30px;">
          <div style="font-size: 60px; font-weight: bold; white-space: nowrap;">Container ID:</div>
          <div style="background: white; color: black; padding: 32px 48px; border-radius: 18px; 
                      font-size: 52px; font-weight: 600; flex: 1;">
            ${container.container}
          </div>
        </div>

        <!-- Responsible Group -->
        <div style="margin-bottom: 55px; display: flex; align-items: center; gap: 30px;">
          <div style="font-size: 60px; font-weight: bold; white-space: nowrap;">Responsible Group:</div>
          <div style="background: white; color: black; padding: 32px 48px; border-radius: 18px; 
                      font-size: 52px; font-weight: 600; flex: 1;">
            ${container.department}
          </div>
        </div>

        <!-- Responsible Person/Phone Number -->
        <div style="margin-bottom: 55px; display: flex; align-items: center; gap: 30px;">
          <div style="font-size: 60px; font-weight: bold; white-space: nowrap;">Responsible Person/Phone Number:</div>
          <div style="background: white; color: black; padding: 32px 48px; border-radius: 18px; 
                      font-size: 52px; font-weight: 600; flex: 1;">
            ${container.submitted_by}
          </div>
        </div>

        <!-- Container Use -->
        <div style="margin-bottom: 55px; display: flex; align-items: center; gap: 30px;">
          <div style="font-size: 60px; font-weight: bold; white-space: nowrap;">Container Use:</div>
          <div style="background: white; color: black; padding: 32px 48px; border-radius: 18px; 
                      font-size: 52px; min-height: 100px; flex: 1;">
            &nbsp;
          </div>
        </div>

        <!-- HAZARDS Section - WHITE BACKGROUND -->
        <div style="margin-bottom: 55px;">
          <h2 style="font-size: 68px; font-weight: bold; margin: 0 0 32px 0;">HAZARDS:</h2>
          <div style="background: white; padding: 65px; border-radius: 40px;">
            <div style="display: grid; grid-template-columns: repeat(11, 1fr); gap: 32px; align-items: end;">
              ${hazardCategories.map(hazard => {
                const isSelected = selectedHazardIds.includes(hazard.id);
                return `
                  <div style="text-align: center;">
                    <img src="${window.location.origin}${hazard.logo_path}" 
                        alt="${hazard.name}" 
                        style="width: 200px; height: 200px; object-fit: contain; margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />
                    <div style="width: 115px; height: 115px; border: 6px solid #333; 
                                background: white; margin: 0 auto; display: flex; 
                                align-items: center; justify-content: center; border-radius: 12px;">
                      ${isSelected ? '<span style="font-size: 85px; color: #4CAF50; font-weight: bold; line-height: 1;">✓</span>' : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Precautions Section - WHITE BACKGROUND with QR Code -->
        <div style="margin-top: 55px; position: relative;">
          <h2 style="font-size: 68px; font-weight: bold; margin: 0 0 32px 0;">Precautions for Entering the Container:</h2>
          <div style="background: white; padding: 65px; border-radius: 40px; position: relative;">
            <ul style="color: black; font-size: 52px; line-height: 2.2; margin: 0; padding-left: 65px; padding-right: 400px;">
              <li style="margin-bottom: 24px;">Ventilate container</li>
              <li>Complete atmospheric testing prior to entering</li>
            </ul>
            
            <!-- QR Code - Inside Precautions Section, Right Side, SMALLER SIZE -->
            <div style="position: absolute; top: 50%; right: 65px; transform: translateY(-50%); text-align: center;">
              <div style="background: white; padding: 15px; border-radius: 20px; border: 4px solid #ddd;">
                <img src="${qrCodeDataURL}" 
                    alt="QR Code" 
                    style="width: 250px; height: 250px; display: block;" />
                <div style="color: black; font-size: 20px; font-weight: bold; margin-top: 10px;">
                  Scan to Download PDF
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(pdfContainer);

    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Generate PDF using html2canvas
    const canvas = await html2canvas(pdfContainer, {
      scale: 2,
      backgroundColor: '#000000',
      logging: false,
      useCORS: true,
      width: 3508,
      height: 2480
    });

    // Remove temporary container
    document.body.removeChild(pdfContainer);

    // Create PDF with A3 landscape dimensions (420mm x 297mm)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3'
    });

    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, 420, 297);

    // Save PDF
    pdf.save(`Container_${container.container}_Safety_Label.pdf`);

    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
    return false;
  }
};

const SuccessModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  containerName: string;
}> = ({ isOpen, onClose, containerName }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(30, 58, 95, 0.85)',
      backdropFilter: 'blur(5px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '20px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        border: '3px solid #4CAF50',
        animation: 'slideIn 0.3s ease',
        overflow: 'hidden'
      }}>
        {/* Success Icon */}
        <div style={{
          background: 'linear-gradient(135deg, #4CAF50, #45a049)',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            background: 'white',
            borderRadius: '50%',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '3rem',
            animation: 'scaleIn 0.5s ease'
          }}>
            ✅
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 style={{
            color: 'var(--kinross-navy)',
            fontSize: '1.8rem',
            marginBottom: '1rem',
            fontWeight: '700'
          }}>
            🎉 Success!
          </h2>
          <p style={{
            color: 'var(--kinross-dark-gray)',
            fontSize: '1.1rem',
            marginBottom: '0.5rem',
            lineHeight: '1.6'
          }}>
            Container safety assessment submitted successfully!
          </p>
          <div style={{
            background: 'var(--kinross-light-gray)',
            padding: '1rem',
            borderRadius: '10px',
            margin: '1.5rem 0',
            border: '2px solid var(--kinross-gold)'
          }}>
            <p style={{
              margin: 0,
              fontSize: '0.9rem',
              color: 'var(--kinross-dark-gray)',
              marginBottom: '0.5rem'
            }}>
              <strong>Container ID:</strong>
            </p>
            <p style={{
              margin: 0,
              fontSize: '1.3rem',
              fontWeight: '700',
              color: 'var(--kinross-gold)'
            }}>
              {containerName}
            </p>
          </div>
          <p style={{
            color: 'var(--kinross-dark-gray)',
            fontSize: '0.95rem',
            fontStyle: 'italic',
            marginBottom: '1.5rem'
          }}>
            Your assessment is now pending approval
          </p>
          <button
            onClick={onClose}
            style={{
              background: 'linear-gradient(135deg, var(--kinross-gold), var(--kinross-dark-gold))',
              color: 'white',
              border: 'none',
              padding: '1rem 3rem',
              borderRadius: '50px',
              fontSize: '1.1rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(212, 165, 83, 0.3)',
              transition: 'all 0.3s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(212, 165, 83, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(212, 165, 83, 0.3)';
            }}
          >
            OK, Got It!
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [hazardCategories, setHazardCategories] = useState<HazardCategory[]>([]);
  const [selectedHazards, setSelectedHazards] = useState<HazardCategory[]>([]);
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  // const [submittedBy, setSubmittedBy] = useState('');
  const [container, setContainer] = useState('');
  const [containerType, setContainerType] = useState('');
  const [hazardPairs, setHazardPairs] = useState<HazardPairData[]>([]);
  const [containers, setContainers] = useState<ContainerData[]>([]);
  // UPDATE THIS EXISTING LINE (change 'containers' to 'approvals'):
  const [activeTab, setActiveTab] = useState<'form' | 'containers' | 'approvals' | 'deletions' | 'admin-deletions' | 'analytics' | 'users'>('form');
  const [loading, setLoading] = useState(false);
  const [pairStatuses, setPairStatuses] = useState<{[key: string]: any}>({});
  const [pendingContainers, setPendingContainers] = useState<ContainerData[]>([]);

  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [selectedContainerForDeletion, setSelectedContainerForDeletion] = useState<number | null>(null);
  const [deletionReason, setDeletionReason] = useState('');

  const [analyticsData, setAnalyticsData] = useState<AnalyticsData[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsFilters, setAnalyticsFilters] = useState({
    department: '',
    submitter: '',
    containerType: '',
    startDate: '',
    endDate: ''
  });

  const [showAdminReviewModal, setShowAdminReviewModal] = useState(false);
  const [selectedRequestForReview, setSelectedRequestForReview] = useState<DeletionRequest | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedContainerName, setSubmittedContainerName] = useState('');

  // AUTH STATES:
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('access_token'),
    loading: true
  });
  const [showAuth, setShowAuth] = useState(false);
  const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
  const [authEmail, setAuthEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // ADD THIS NEW STATE for hazard compatibility warnings
  const [hazardWarnings, setHazardWarnings] = useState<{
    [key: number]: {
      status: 'safe' | 'warning' | 'danger';
      message: string;
      incompatibleWith?: number[];
    }
  }>({});

  const [approvalModal, setApprovalModal] = useState<{ isOpen: boolean; type: 'approve' | 'reject'; containerId: number }>({
    isOpen: false,
    type: 'approve',
    containerId: 0
  });

  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    email: '',
    name: '',
    role: 'user',
    department: '',
    active: true
  });  

  useEffect(() => {
    checkAuthStatus(); // Check auth first, don't call other functions yet
    fetchHazardCategories(); // This can be called immediately since it doesn't require auth
    // fetchContainers();
  }, []);

  // ADD THIS NEW useEffect HERE:
  useEffect(() => {
    if (authState.user && !authState.loading) {
      fetchContainers(); // Only fetch containers after user is authenticated
    }
  }, [authState.user, authState.loading]);

  // ADD THIS NEW useEffect:
  useEffect(() => {
    // // Generate container ID when component mounts
    // if (!container) {
    //   generateContainerID().then(setContainer);
    // }
  }, []);

  // ADD NEW useEffect to generate ID when department changes
  useEffect(() => {
    // Generate new container ID when department is selected
    if (department && !container) {
      generateContainerID(department).then(setContainer);
    }
  }, [department]); // Trigger when department changes

  // Handle QR code download trigger
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const downloadId = urlParams.get('download');
    
    if (downloadId && authState.user) {
      // Fetch container and generate PDF
      fetch(`${API_BASE}/containers/`, {
        headers: { 'Authorization': `Bearer ${authState.token}` }
      })
        .then(res => res.json())
        .then(containers => {
          const container = containers.find((c: ContainerData) => c.id === parseInt(downloadId));
          if (container && container.status === 'approved') {
            generateContainerPDF(container, hazardCategories);
            // Clear URL parameter
            window.history.replaceState({}, '', '/');
          }
        })
        .catch(err => console.error('Error fetching container for download:', err));
    }
  }, [authState.user, authState.token]);

  const fetchHazardCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/hazard-categories/`);
      const data = await response.json();
      setHazardCategories(data);
    } catch (error) {
      console.error('Error fetching hazard categories:', error);
    }
  };

  const fetchContainers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/containers/`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setContainers(data);
    } catch (error) {
      console.error('Error fetching containers:', error);
    }
  };

  // API call to get real-time status
  const getPreviewStatus = async (hazard_a_id: number, hazard_b_id: number, distance: number) => {
    try {
      const response = await fetch(`${API_BASE}/preview-status/?hazard_a_id=${hazard_a_id}&hazard_b_id=${hazard_b_id}&distance=${distance}`, {
        method: 'POST'
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error getting preview status:', error);
    }
    return { status: "unknown", is_isolated: false, min_required_distance: 0 };
  };

  const generateHazardPairs = async (hazards: HazardCategory[]) => {
    const pairs: HazardPairData[] = [];
    const newPairStatuses: {[key: string]: any} = {};
    
    for (let i = 0; i < hazards.length; i++) {
      for (let j = i + 1; j < hazards.length; j++) {
        const pair = {
          hazard_category_a_id: hazards[i].id,
          hazard_category_b_id: hazards[j].id,
          distance: 0
        };
        pairs.push(pair);
        
        // Get status for each pair with 0 distance
        const status = await getPreviewStatus(pair.hazard_category_a_id, pair.hazard_category_b_id, 0);
        const pairKey = `${pair.hazard_category_a_id}-${pair.hazard_category_b_id}`;
        newPairStatuses[pairKey] = status;
      }
    }
    
    setHazardPairs(pairs);
    setPairStatuses(newPairStatuses);
  };


  const handleHazardSelect = async (category: HazardCategory) => {
    const isSelected = selectedHazards.find(h => h.id === category.id);
    let newSelected: HazardCategory[];
    let newWarnings = { ...hazardWarnings };
    
    if (isSelected) {
      // DESELECTING - Remove hazard
      newSelected = selectedHazards.filter(h => h.id !== category.id);
      
      // Remove warnings for deselected hazard
      delete newWarnings[category.id];
      
      // Recalculate warnings for remaining hazards
      if (newSelected.length > 0) {
        // Clear all warnings first
        newWarnings = {};
        
        // Check each remaining hazard against others
        for (const hazard of newSelected) {
          const otherHazards = newSelected.filter(h => h.id !== hazard.id);
          const warnings = await checkHazardCompatibility(hazard, otherHazards);
          newWarnings = { ...newWarnings, ...warnings };
        }
      }
    } else {
      // SELECTING - Add new hazard
      newSelected = [...selectedHazards, category];
      
      // Check compatibility of new hazard with existing ones
      const warnings = await checkHazardCompatibility(category, selectedHazards);
      newWarnings = { ...newWarnings, ...warnings };
    }
    
    setSelectedHazards(newSelected);
    setHazardWarnings(newWarnings);
    await generateHazardPairs(newSelected);
  };

  const updatePairDistance = async (index: number, distance: number) => {
    const updatedPairs = [...hazardPairs];
    updatedPairs[index].distance = distance;
    setHazardPairs(updatedPairs);
    
    // Get real-time status from backend
    const pair = updatedPairs[index];
    const status = await getPreviewStatus(pair.hazard_category_a_id, pair.hazard_category_b_id, distance);
    const pairKey = `${pair.hazard_category_a_id}-${pair.hazard_category_b_id}`;
    setPairStatuses(prev => ({ ...prev, [pairKey]: status }));
  };

  const getHazardName = (id: number) => {
    return hazardCategories.find(h => h.id === id)?.name || `Hazard ${id}`;
  };

  const getIsolationStatus = (is_isolated: boolean, min_required_distance: number) => {
    if (is_isolated) {
      return { text: "MUST BE ISOLATED", color: "#c62828", bgColor: "#ffebee" };
    } else if (min_required_distance === 3.0) {
      return { text: "SAME TYPE", color: "#f57f17", bgColor: "#fff8e1" };
    } else if (min_required_distance >= 20.0) {
      return { text: "INCOMPATIBLE", color: "#c62828", bgColor: "#ffebee" };
    } else {
      return { text: "COMPATIBLE", color: "#2e7d32", bgColor: "#e8f5e8" };
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe': return { backgroundColor: '#e8f5e8', color: '#2e7d32', border: '2px solid #4caf50' };
      case 'caution': return { backgroundColor: '#fff8e1', color: '#f57f17', border: '2px solid #ff9800' };
      case 'danger': return { backgroundColor: '#ffebee', color: '#c62828', border: '2px solid #f44336' };
      default: return {};
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'safe': return 'SAFE';
      case 'caution': return 'CAUTION';
      case 'danger': return 'DANGER';
      default: return 'UNKNOWN';
    }
  };

  // THIS FUNCTION: isolate required hazards which can not goes with each other
  const hasIsolationRequired = () => {
    for (const pair of hazardPairs) {
      const pairKey = `${pair.hazard_category_a_id}-${pair.hazard_category_b_id}`;
      const status = pairStatuses[pairKey];
      if (status && status.is_isolated) {
        return {
          hasIsolation: true,
          hazardA: getHazardName(pair.hazard_category_a_id),
          hazardB: getHazardName(pair.hazard_category_b_id)
        };
      }
    }
    return { hasIsolation: false };
  };

  // THIS FUNCTION: check if any distance is geq to required distance or eq zero
  const hasEmptyDistances = () => {
    // If no pairs, no validation needed
    if (hazardPairs.length === 0) {
      return false;
    }
    
    // Check each pair for:
    // 1. Empty or zero distance
    // 2. Distance less than required minimum
    for (const pair of hazardPairs) {
      const pairKey = `${pair.hazard_category_a_id}-${pair.hazard_category_b_id}`;
      const status = pairStatuses[pairKey];
      
      // Check if distance is empty or zero
      // if (!pair.distance || pair.distance === 0) {
      //   return true;
      // }
      
      // Check if status is 'danger' or 'caution' (means distance is insufficient)
      if (status && (status.status === 'danger' || status.status === 'caution')) {
        return true;
      }
      
      // Alternative: Check if distance is less than required minimum
      if (status && status.min_required_distance) {
        if (pair.distance < status.min_required_distance) {
          return true;
        }
      }
    }
    
    return false;
  };

  // ADD THIS NEW FUNCTION
  const checkHazardCompatibility = async (
    newHazard: HazardCategory, 
    existingHazards: HazardCategory[]
  ) => {
    const warnings: {
      [key: number]: {
        status: 'safe' | 'warning' | 'danger';
        message: string;
        incompatibleWith?: number[];
      }
    } = {};

    // If no existing hazards, new hazard is safe
    if (existingHazards.length === 0) {
      warnings[newHazard.id] = {
        status: 'safe',
        message: '✅ First hazard - OK to add'
      };
      return warnings;
    }

    // Check new hazard against all existing hazards
    const incompatibleIds: number[] = [];
    let worstStatus: 'safe' | 'warning' | 'danger' = 'safe';
    let hasIsolationRequired = false;

    for (const existingHazard of existingHazards) {
      try {
        const response = await fetch(
          `${API_BASE}/preview-status/?hazard_a_id=${newHazard.id}&hazard_b_id=${existingHazard.id}&distance=0`,
          { method: 'POST' }
        );
        
        if (response.ok) {
          const statusData = await response.json();
          
          // Check if isolation is required
          if (statusData.is_isolated) {
            hasIsolationRequired = true;
            incompatibleIds.push(existingHazard.id);
            worstStatus = 'danger';
          } else if (statusData.min_required_distance >= 5 && worstStatus !== 'danger') {
            worstStatus = 'warning';
          }
        }
      } catch (error) {
        console.error('Error checking compatibility:', error);
      }
    }

    // Set warning for the new hazard
    if (hasIsolationRequired) {
      warnings[newHazard.id] = {
        status: 'danger',
        message: '🚫 CANNOT be stored with selected hazards',
        incompatibleWith: incompatibleIds
      };
      
      // Mark existing incompatible hazards as well
      incompatibleIds.forEach(id => {
        warnings[id] = {
          status: 'danger',
          message: '🚫 INCOMPATIBLE with new selection',
          incompatibleWith: [newHazard.id]
        };
      });
    } else if (worstStatus === 'warning') {
      warnings[newHazard.id] = {
        status: 'warning',
        message: '⚠️ Requires separation distance',
      };
    } else {
      warnings[newHazard.id] = {
        status: 'safe',
        message: '✅ Compatible with selected hazards',
      };
    }

    return warnings;
  };

  // Authentication functions
  const checkAuthStatus = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setAuthState({ user: null, token: null, loading: false });
      setShowAuth(true);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const user = await response.json();
        setAuthState({ user, token, loading: false });
        setShowAuth(false);
      } else {
        localStorage.removeItem('access_token');
        setAuthState({ user: null, token: null, loading: false });
        setShowAuth(true);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('access_token');
      setAuthState({ user: null, token: null, loading: false });
      setShowAuth(true);
    }
  };

  const requestVerificationCode = async () => {
    setAuthLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail })
      });

      if (response.ok) {
        setAuthStep('code');
        alert('Verification code sent to your email');
      } else {
        const error = await response.json();
        alert(error.detail || 'Failed to send verification code');
      }
    } catch (error) {
      alert('Failed to send verification code');
    } finally {
      setAuthLoading(false);
    }
  };

  const verifyCode = async () => {
    setAuthLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, code: authCode })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('access_token', data.access_token);
        setAuthState({ user: data.user, token: data.access_token, loading: false });
        setShowAuth(false);
        setAuthEmail('');
        setAuthCode('');
        setAuthStep('email');
      } else {
        const error = await response.json();
        alert(error.detail || 'Verification failed');
      }
    } catch (error) {
      alert('Verification failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setAuthState({ user: null, token: null, loading: false });
    setShowAuth(true);
  };  

  const fetchPendingContainers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/containers/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setPendingContainers(data);
    } catch (error) {
      console.error('Error fetching pending containers:', error);
    }
  };

  const fetchDeletionRequests = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/deletion-requests/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDeletionRequests(data);
      } else {
        console.error('Failed to fetch deletion requests');
      }
    } catch (error) {
      console.error('Error fetching deletion requests:', error);
    }
  };  

  const approveContainer = async (containerId: number, status: string, comment: string) => {
    // FRONTEND VALIDATION (belt and suspenders)
    if (!comment || comment.trim().length === 0) {
      alert('❌ Error: Comment is required');
      return;
    }
    
    if (comment.trim().length < 10) {
      alert('❌ Error: Comment must be at least 10 characters long');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/containers/${containerId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ container_id: containerId, status, comment: comment.trim() })
      });

      // BETTER ERROR HANDLING
      if (response.ok) {
        alert(`✅ Container ${status} successfully!\n\nComment: "${comment.trim()}"`);
        fetchPendingContainers();
        fetchContainers();
      } else {
        const errorData = await response.json();
        alert(`❌ Error: ${errorData.detail || 'Failed to process approval'}`);
      }
    } catch (error) {
      console.error('Error processing approval:', error);
      alert('❌ Error processing approval. Please try again.');
    }
  };

  const deleteContainer = async (containerId: number, containerName: string) => {
    if (!confirm(`Are you sure you want to delete container ${containerName}? This action cannot be undone.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/containers/${containerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('Container deleted successfully');
        fetchPendingContainers();
        fetchContainers();
      } else {
        const error = await response.json();
        alert(`Error: ${error.detail}`);
      }
    } catch (error) {
      alert('Error deleting container');
    }
  };

  const requestContainerDeletion = async (containerId: number, reason: string) => {
    if (!reason || reason.trim().length < 20) {
      alert('❌ Deletion reason must be at least 20 characters long');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/containers/${containerId}/request-deletion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ container_id: containerId, reason: reason.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`✅ ${data.message}`);
        setShowDeletionModal(false);
        setDeletionReason('');
        setSelectedContainerForDeletion(null);
        fetchContainers();
        if (authState.user?.role === 'hod') {
          fetchDeletionRequests();
        }
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error requesting deletion:', error);
      alert('❌ Error requesting deletion. Please try again.');
    }
  };  

  const adminReviewDeletion = async (requestId: number, comment: string, recommendation: 'approve' | 'reject') => {
    if (!comment || comment.trim().length < 10) {
      alert('❌ Admin review comment must be at least 10 characters long');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/deletion-requests/${requestId}/admin-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          deletion_request_id: requestId, 
          comment: comment.trim(),
          recommendation 
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`✅ ${data.message}`);
        setShowAdminReviewModal(false);
        setSelectedRequestForReview(null);
        fetchDeletionRequests();
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error submitting admin review:', error);
      alert('❌ Error submitting review. Please try again.');
    }
  };

  const hodFinalDecision = async (requestId: number, decision: 'approved' | 'rejected', comment: string) => {
    if (!comment || comment.trim().length < 10) {
      alert('❌ HOD decision comment must be at least 10 characters long');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/deletion-requests/${requestId}/hod-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          deletion_request_id: requestId, 
          decision, 
          comment: comment.trim() 
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`✅ ${data.message}`);
        fetchDeletionRequests();
        fetchContainers();
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error in HOD decision:', error);
      alert('❌ Error processing decision. Please try again.');
    }
  };  

  const fetchAnalyticsData = async () => {
    setAnalyticsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/analytics/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      } else {
        console.error('Failed to fetch analytics data');
      }
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const getFilteredAnalytics = () => {
    return analyticsData.filter(item => {
      const matchDept = !analyticsFilters.department || item.department === analyticsFilters.department;
      const matchSubmitter = !analyticsFilters.submitter || item.submitted_by === analyticsFilters.submitter;
      const matchType = !analyticsFilters.containerType || item.container_type === analyticsFilters.containerType;
      
      const itemDate = new Date(item.submitted_at);
      const matchStartDate = !analyticsFilters.startDate || itemDate >= new Date(analyticsFilters.startDate);
      const matchEndDate = !analyticsFilters.endDate || itemDate <= new Date(analyticsFilters.endDate);
      
      return matchDept && matchSubmitter && matchType && matchStartDate && matchEndDate;
    });
  };

  const getDepartmentStats = () => {
    const filtered = getFilteredAnalytics();
    const stats: {[key: string]: number} = {};
    filtered.forEach(item => {
      stats[item.department] = (stats[item.department] || 0) + 1;
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  };

  const getLocationStats = () => {
    const filtered = getFilteredAnalytics();
    const stats: {[key: string]: number} = {};
    filtered.forEach(item => {
      stats[item.location] = (stats[item.location] || 0) + 1;
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  };

  const getSubstanceStats = () => {
    const filtered = getFilteredAnalytics();
    const stats: {[key: string]: number} = {};
    filtered.forEach(item => {
      item.hazards.forEach(hazard => {
        const key = `Class ${hazard.hazard_class} - ${hazard.name}`;
        stats[key] = (stats[key] || 0) + 1;
      });
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  };

  const getStatusStats = () => {
    const filtered = getFilteredAnalytics();
    const stats: {[key: string]: number} = {
      'Approved': 0,
      'Pending': 0,
      'Rejected': 0
    };
    
    filtered.forEach(item => {
      const status = item.status.charAt(0).toUpperCase() + item.status.slice(1);
      if (status in stats) {
        stats[status] = stats[status] + 1;
      }
    });
    
    // Return in fixed order: Approved, Pending, Rejected
    // KEEP ALL STATUSES even if value is 0 to maintain color mapping
    return [
      { name: 'Approved', value: stats['Approved'] },
      { name: 'Pending', value: stats['Pending'] },
      { name: 'Rejected', value: stats['Rejected']}
    ];
  };

  const getUniqueValues = (field: 'department' | 'submitted_by' | 'container_type') => {
    return [...new Set(analyticsData.map(item => item[field]))].sort();
  };

  const submitContainer = async () => {
    if (!department.trim() || !location.trim() || !container.trim() || !containerType.trim()) {
      alert('Please fill in all required fields (Department, Location, Container, Type)');
      return;
    }
    
    if (selectedHazards.length === 0) {
      alert('Please select at least one hazard category');
      return;
    }

    // VALIDATION CHECK:
    const isolationCheck = hasIsolationRequired();
    if (isolationCheck.hasIsolation) {
      alert(`⚠️ SUBMISSION BLOCKED\n\nThe hazard pair "${isolationCheck.hazardA}" and "${isolationCheck.hazardB}" MUST BE ISOLATED and cannot be stored in the same container.\n\nThese chemicals require complete separation and cannot be combined in any container configuration.`);
      return;
    }

    // VALIDATION CHECK:
    if (hasEmptyDistances()) {
      alert('⚠️ SUBMISSION BLOCKED\n\nOne or more hazard pairs do not meet the required safety distance.\n\nPlease ensure:\n• All distance fields are filled (greater than 0)\n• All distances meet or exceed the minimum required distance\n• No pairs show DANGER or CAUTION status\n\nAdjust the distances until all pairs show SAFE status.');
      return;
    }

    setLoading(true);

    const payload = {
      department,
      location,
      submitted_by: authState.user?.name || '', // Use authenticated user's name
      container,
      container_type: containerType,
      selected_hazards: selectedHazards.map(h => h.id),
      hazard_pairs: hazardPairs
    };

    console.log('Submitting payload:', payload); 

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/containers/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      // ADD ERROR DETAILS:
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Backend error:', errorData);
        throw new Error(`Server error: ${response.status}`);
      }

      if (response.ok) {
        const result = await response.json();
        // alert(`Container safety assessment submitted successfully!\nContainer ID: ${result.container_id}`);
        // Store container name and show modal instead of alert
        setSubmittedContainerName(result.container || container);
        setShowSuccessModal(true);

        // Reset form (but keep user name)
        setDepartment('');
        setLocation('');
        // Don't reset submittedBy - it's auto-filled
        setContainer('');
        setContainerType('');
        setSelectedHazards([]);
        setHazardPairs([]);
        setPairStatuses({});
        
        // Refresh containers list
        fetchContainers();
      } else {
        throw new Error('Failed to submit container data');
      }
    } catch (error) {
      console.error('Error submitting container:', error);
      alert('Error submitting container data');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = async () => {
    const currentDept = department; // Save current department
    
    setDepartment('');
    setLocation('');
    setContainerType('');
    setSelectedHazards([]);
    setHazardPairs([]);
    setPairStatuses({});
    setContainer(''); // Clear container ID
    
    // If department was selected, regenerate ID after reset
    if (currentDept) {
      const newId = await generateContainerID(currentDept);
      setContainer(newId);
      setDepartment(currentDept); // Restore department
    }
  };

  const AuthModal = () => (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30, 58, 95, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  }}>
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '2rem',
      width: '450px',
      maxWidth: '90vw',
      boxSizing: 'border-box',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
    }}>
        {/* Logo Row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid var(--kinross-light-gray)'
        }}>
          <img 
            src="/kinross-logo.png" 
            alt="Kinross Gold Corporation" 
            style={{
              height: '50px',
              objectFit: 'contain',
              maxWidth: '45%'
            }}
          />
          <img 
            src="/safeground-logo.png" 
            alt="Safeground" 
            style={{
              height: '40px',
              objectFit: 'contain',
              maxWidth: '45%'
            }}
          />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ color: 'var(--kinross-navy)', marginBottom: '0.5rem' }}>
            Chemical Safety System
          </h2>
          <p style={{ color: 'var(--kinross-dark-gray)' }}>
            Kinross Gold Corporation
          </p>
        </div>

        {authStep === 'email' ? (
          <div>
            <label style={{ 
                display: 'block', 
                marginBottom: '0.875rem',      // ✅ Reduced from 1rem
                fontWeight: '600',
                fontSize: '0.95rem'            // ✅ Added
            }}>
              Corporate Email Address:
              {/* // Fix for email input (in AuthModal) */}
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="your.name@kinross.com"
                style={{
                  width: '100%',
                  padding: '0.875rem',           // ✅ Reduced from 1rem
                  marginTop: '0.5rem',
                  border: '2px solid var(--kinross-medium-gray)',
                  borderRadius: '6px',
                  fontSize: '0.95rem',           // ✅ Reduced from 1rem
                  boxSizing: 'border-box'        // ✅ Added for better sizing
                }}
                autoComplete="email"
                autoFocus  // Add this line
                onKeyPress={(e) => e.key === 'Enter' && authEmail && requestVerificationCode()}
              />
            </label>
            <button
              onClick={requestVerificationCode}
              disabled={!authEmail || authLoading}
              style={{
                width: '100%',
                padding: '1rem',
                background: 'var(--kinross-gold)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: authLoading ? 'not-allowed' : 'pointer',
                opacity: authLoading ? 0.6 : 1
              }}
            >
              {authLoading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ marginBottom: '1rem', textAlign: 'center' }}>
              Enter the 6-digit code sent to:<br />
              <strong>{authEmail}</strong>
            </p>
            <label style={{ display: 'block', marginBottom: '1rem', fontWeight: '600' }}>
              Verification Code:
              <input
                type="text"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                style={{
                  width: '100%',
                  padding: '1rem',
                  marginTop: '0.5rem',
                  border: '2px solid var(--kinross-medium-gray)',
                  borderRadius: '6px',
                  fontSize: '1.5rem',
                  textAlign: 'center',
                  letterSpacing: '0.5rem',
                  boxSizing: 'border-box'
                }}
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && authCode.length === 6 && verifyCode()}
              />
            </label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => {
                  setAuthStep('email');
                  setAuthCode('');
                }}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: 'transparent',
                  color: 'var(--kinross-navy)',
                  border: '2px solid var(--kinross-medium-gray)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Back
              </button>
              <button
                onClick={verifyCode}
                disabled={authCode.length !== 6 || authLoading}
                style={{
                  flex: 2,
                  padding: '1rem',
                  background: 'var(--kinross-gold)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: authCode.length !== 6 || authLoading ? 'not-allowed' : 'pointer',
                  opacity: authCode.length !== 6 || authLoading ? 0.6 : 1
                }}
              >
                {authLoading ? 'Verifying...' : 'Verify Code'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Status Badge Component
  const StatusBadge = ({ status }: { status: string }) => {
    const getStatusStyle = () => {
      switch (status) {
        case 'approved': return { backgroundColor: '#e8f5e8', color: '#2e7d32', border: '2px solid #4caf50' };
        case 'rejected': return { backgroundColor: '#ffebee', color: '#c62828', border: '2px solid #f44336' };
        case 'pending': return { backgroundColor: '#fff3e0', color: '#f57c00', border: '2px solid #ff9800' };
        default: return { backgroundColor: '#f5f5f5', color: '#666', border: '2px solid #ccc' };
      }
    };

    return (
      <span style={{
        ...getStatusStyle(),
        padding: '0.25rem 0.75rem',
        borderRadius: '15px',
        fontSize: '0.8rem',
        fontWeight: '700',
        textTransform: 'uppercase'
      }}>
        {status}
      </span>
    );
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/users/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const createUser = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/users/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(userFormData)
      });

      if (response.ok) {
        alert('✅ User created successfully!');
        setShowUserModal(false);
        setUserFormData({ email: '', name: '', role: 'user', department: '', active: true });
        fetchUsers();
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('❌ Error creating user');
    }
  };

  const updateUser = async () => {
    if (!editingUser) return;
    
    try {
      const token = localStorage.getItem('access_token');
      
      // Build query parameters for fields that have values
      const params = new URLSearchParams();
      if (userFormData.email) params.append('email', userFormData.email);
      if (userFormData.name) params.append('name', userFormData.name);
      if (userFormData.role) params.append('role', userFormData.role);
      if (userFormData.department) params.append('department', userFormData.department);
      params.append('active', String(userFormData.active));
      
      const response = await fetch(`${API_BASE}/users/${editingUser.id}?${params.toString()}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('✅ User updated successfully!');
        setShowUserModal(false);
        setEditingUser(null);
        setUserFormData({ email: '', name: '', role: 'user', department: '', active: true });
        fetchUsers();
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('❌ Error updating user');
    }
  };

  const deleteUser = async (userId: number, userName: string) => {
    if (!confirm(`Are you sure you want to delete user "${userName}"?`)) return;
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        alert('✅ User deleted successfully!');
        fetchUsers();
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('❌ Error deleting user');
    }
  };

  const toggleUserActive = async (userId: number, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ active: !currentStatus })
      });

      if (response.ok) {
        alert(`✅ User ${!currentStatus ? 'activated' : 'deactivated'} successfully!`);
        fetchUsers();
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error toggling user status:', error);
      alert('❌ Error updating user status');
    }
  };

  return (
    <div className="App">
      {/* Show loading spinner while checking auth */}
      {authState.loading && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh' 
        }}>
          <div className="loading">Loading...</div>
        </div>
      )}

      {/* Show auth modal if not authenticated */}
      {showAuth && !authState.loading && <AuthModal />}

      {/* Show main app if authenticated */}
      {authState.user && !showAuth && (
        <>
          <header className="app-header">
            {/* Logo Row */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid var(--kinross-light-gray)',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <img 
                src="/kinross-logo.png" 
                alt="Kinross Gold Corporation" 
                style={{
                  height: '60px',
                  objectFit: 'contain',
                  maxWidth: '200px'
                }}
              />
              <img 
                src="/safeground-logo.png" 
                alt="Safeground" 
                style={{
                  height: '50px',
                  objectFit: 'contain',
                  maxWidth: '200px'
                }}
              />
            </div>

            {/* Title Section */}
            <h1>Chemical Container Safety Assessment</h1>
            <p className="kinross-subtitle">Kinross Gold Corporation - DOT Hazard Class Compatibility System</p>
      
            {/* ADD USER INFO */}
            {authState.user && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '1rem',
                padding: '1rem',
                background: 'var(--kinross-light-gray)',
                borderRadius: '8px'
              }}>
                <div>
                  <strong>{authState.user.name}</strong> ({authState.user.role})
                  <br />
                  <small>{authState.user.email} • {authState.user.department}</small>
                </div>
                <button 
                  onClick={logout}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--kinross-safety-red)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Logout
                </button>
              </div>
            )}

            <nav>
              {authState.user && (authState.user.role === 'hod' || authState.user.role === 'admin' || authState.user.role === 'user') && (
                <button 
                  className={activeTab === 'form' ? 'active' : ''}
                  onClick={() => setActiveTab('form')}
                >
                  <span>New Container Assessment</span>
                </button>
              )}

              {/* UPDATE containers button: */}
              {authState.user && (
                <button 
                  className={activeTab === 'containers' ? 'active' : ''}
                  onClick={() => {
                    setActiveTab('containers');
                    if (authState.user) {
                      fetchContainers(); // Add this line
                    }
                  }}
                >
                  <span>View Assessments</span>
                </button>
              )}

              {/* UPDATE approvals button: */}
              {authState.user && (authState.user.role === 'hod' || authState.user.role === 'admin') && (
                <button 
                  className={activeTab === 'approvals' ? 'active' : ''}
                  onClick={() => {
                    setActiveTab('approvals');
                    if (authState.user && (authState.user.role === 'hod' || authState.user.role === 'admin')) {
                      fetchPendingContainers(); // Add this line
                    }
                  }}
                >
                  <span>Pending Approvals</span>
                </button>
              )}

              {/* ✅ ADD THIS NEW TAB FOR ADMIN: */}
              {authState.user?.role === 'admin' && (
                <button 
                  className={activeTab === 'admin-deletions' ? 'active' : ''}
                  onClick={() => {
                    setActiveTab('admin-deletions');
                    fetchDeletionRequests();
                  }}
                >
                  <span>🔍 Review Deletions</span>
                </button>
              )}

              {/* NEW TAB FOR HOD: */}
              {authState.user?.role === 'hod' && (
                <button 
                  className={activeTab === 'deletions' ? 'active' : ''}
                  onClick={() => {
                    setActiveTab('deletions');
                    fetchDeletionRequests();
                  }}
                >
                  <span>🗑️ Deletion Requests</span>
                </button>
              )}
              
              {/* NEW TAB FOR ANALYTICS - HOD ONLY: */}
              {authState.user?.role === 'hod' && (
                <button 
                  className={activeTab === 'analytics' ? 'active' : ''}
                  onClick={() => {
                    setActiveTab('analytics');
                    fetchAnalyticsData();
                  }}
                >
                  <span>📊 Analytics</span>
                </button>
              )}

              {/* User Management Tab - Admin and HOD only */}
              {authState.user && (authState.user.role === 'hod' || authState.user.role === 'admin') && (
                <button 
                  className={activeTab === 'users' ? 'active' : ''}
                  onClick={() => {
                    setActiveTab('users');
                    fetchUsers();
                  }}
                >
                  <span>👥 User Management</span>
                </button>
              )}
            </nav>
          </header>

          <main className="main-content">
            {activeTab === 'form' && (
              <div className="container-form-section">
                <div className="form-header">
                  <h2>Container Safety Assessment Form</h2>
                  <p>Complete this form to assess chemical hazard compatibility for storage containers</p>
                </div>

                {/* Container Information */}
                <div className="container-info">
                  <h3>Container Information</h3>
                  <div className="form-grid">
                    <div className="form-field">
                      <label>
                        Department *
                        <select
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          required
                        >
                          <option value="">Select department</option>
                          {DEPARTMENTS.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="form-field">
                      <label>
                        Location *
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g., Warehouse A or GPS coordinates"
                            required
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (navigator.geolocation) {
                                navigator.geolocation.getCurrentPosition(
                                  (position) => {
                                    const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
                                    setLocation(coords);
                                  },
                                  (error) => {
                                    alert('Unable to get GPS coordinates: ' + error.message);
                                  }
                                );
                              } else {
                                alert('Geolocation is not supported by this browser, please type your location point or common-name');
                              }
                            }}
                            style={{
                              padding: '0.75rem 1rem',
                              background: 'var(--kinross-gold)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: '600'
                            }}
                          >
                            📍 Get GPS
                          </button>
                        </div>
                      </label>
                    </div>
                    <div className="form-field">
                      <label>
                        Submitted By *
                        <input
                          type="text"
                          value={authState.user?.name || ''}
                          readOnly
                          required
                          style={{ 
                            backgroundColor: '#f5f5f5',
                            cursor: 'not-allowed',
                            color: '#666',
                            fontSize: '0.9rem',              // ✅ ADD
                            padding: '0.875rem',             // ✅ ADD
                            overflow: 'hidden',              // ✅ ADD
                            textOverflow: 'ellipsis',        // ✅ ADD
                            whiteSpace: 'nowrap'             // ✅ ADD
                          }}
                        />
                        <small style={{ 
                          color: 'var(--kinross-dark-gray)', 
                          fontSize: '0.85rem',
                          fontStyle: 'italic',
                          marginTop: '0.25rem',
                          display: 'block'
                        }}>
                          Automatically filled from your user profile
                        </small>
                      </label>
                    </div>
                    <div className="form-field">
                      <label>
                        Container ID *
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={container}
                            readOnly
                            placeholder={department ? "Auto-generated when department selected" : "Select department first"}
                            required
                            style={{ 
                              flex: 1,
                              backgroundColor: '#f5f5f5',
                              cursor: 'not-allowed',
                              color: department ? '#666' : '#999',
                              fontSize: '0.85rem',             // ✅ ADD - smaller font
                              fontWeight: '600',               // ✅ ADD - bold
                              letterSpacing: '-0.02em',        // ✅ ADD - tighter spacing
                              padding: '0.875rem',             // ✅ ADD - adjusted padding
                              overflow: 'hidden',              // ✅ ADD
                              textOverflow: 'ellipsis',        // ✅ ADD
                              whiteSpace: 'nowrap'             // ✅ ADD
                            }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!department) {
                                alert('Please select a department first');
                                return;
                              }
                              const newId = await generateContainerID(department);
                              setContainer(newId);
                            }}
                            disabled={!department}
                            style={{
                              padding: '0.75rem 1rem',
                              background: department ? 'var(--kinross-gold)' : '#ccc',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: department ? 'pointer' : 'not-allowed',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              whiteSpace: 'nowrap',
                              opacity: department ? 1 : 0.6
                            }}
                            title={department ? 'Generate new container ID' : 'Select department first'}
                          >
                            🔄 Generate New
                          </button>
                        </div>
                        <small style={{ 
                          color: 'var(--kinross-dark-gray)', 
                          fontSize: '0.85rem',
                          fontStyle: 'italic',
                          marginTop: '0.25rem',
                          display: 'block'
                        }}>
                          {department 
                            ? `Format: CONT-####-${DEPARTMENT_ABBREV[department]}` 
                            : 'Container ID will be generated after selecting department'
                          }
                        </small>
                      </label>
                    </div>
                    <div className="form-field">
                      <label>
                        Container Type *
                        <select
                          value={containerType}
                          onChange={(e) => setContainerType(e.target.value)}
                          required
                        >
                          <option value="">Select container type</option>
                          <option value="20ft">20 feet</option>
                          <option value="40ft">40 feet</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                {/* SDS Quick Access */}
                <div className="sds-section" style={{
                  marginBottom: '2rem',
                  padding: '1.5rem',
                  background: 'var(--kinross-light-gray)',
                  borderRadius: '10px',
                  borderLeft: '5px solid #2196F3'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: '1.5rem',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                      <h3 style={{ 
                        color: 'var(--kinross-navy)', 
                        margin: '0 0 0.5rem 0',
                        fontSize: '1.3rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}>
                        📋 Safety Data Sheet (SDS) Lookup
                      </h3>
                      <p style={{ 
                        margin: 0, 
                        color: 'var(--kinross-dark-gray)',
                        fontSize: '1rem',
                        lineHeight: '1.5'
                      }}>
                        Before selecting hazard classes, consult the SDS database to identify 
                        the correct DOT hazard classifications for your chemicals.
                      </p>
                    </div>
                    <a
                      href="https://chemicalsafety.com/sds-search/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '1rem 2rem',
                        background: 'linear-gradient(135deg, var(--kinross-gold), var(--kinross-dark-gold))',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '1.1rem',
                        fontWeight: '700',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 15px rgba(212, 165, 83, 0.3)',
                        whiteSpace: 'nowrap'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(212, 165, 83, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(212, 165, 83, 0.3)';
                      }}
                    >
                      <span style={{ fontSize: '1.3rem' }}>🔍</span>
                      <span>Open SDS Search</span>
                      <span style={{ fontSize: '1rem' }}>↗</span>
                    </a>
                  </div>
                </div>

                {/* Hazard Selection */}
                <div className="hazard-selection">
                  <h3>Select DOT Hazard Classes Present in Container</h3>
                  <div className="ghs-grid">
                    {hazardCategories.map(category => {
                      const isSelected = selectedHazards.find(h => h.id === category.id);
                      const warning = hazardWarnings[category.id];
                      
                      return (
                        <div
                          key={category.id}
                          className={`ghs-card ${isSelected ? 'selected' : ''} ${warning ? `warning-${warning.status}` : ''}`}
                          onClick={() => handleHazardSelect(category)}
                          style={{
                            // Add border colors based on warning status
                            borderColor: warning 
                              ? warning.status === 'danger' 
                                ? '#f44336' 
                                : warning.status === 'warning' 
                                  ? '#ff9800' 
                                  : '#4caf50'
                              : undefined,
                            borderWidth: warning ? '3px' : undefined,
                          }}
                        >
                          {category.logo_path ? (
                            <img
                              src={`${API_BASE}${category.logo_path}`}
                              alt={category.name}
                              className="ghs-logo"
                              style={{
                                // Add overlay effect for danger status
                                opacity: warning?.status === 'danger' ? 0.5 : 1,
                                filter: warning?.status === 'danger' ? 'grayscale(50%)' : 'none'
                              }}
                            />
                          ) : (
                            <div className="ghs-symbol">Class {category.hazard_class}</div>
                          )}
                          
                          <div className="ghs-name">{category.name}</div>
                          <div className="ghs-code">Class {category.subclass}</div>
                          
                          {category.description && (
                            <div className="ghs-description">{category.description}</div>
                          )}
                          
                          {/* ADD WARNING MESSAGE */}
                          {warning && (
                            <div 
                              className="ghs-warning-message"
                              style={{
                                marginTop: '0.75rem',
                                padding: '0.5rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                textAlign: 'center',
                                backgroundColor: 
                                  warning.status === 'danger' 
                                    ? '#ffebee' 
                                    : warning.status === 'warning' 
                                      ? '#fff3e0' 
                                      : '#e8f5e9',
                                color: 
                                  warning.status === 'danger' 
                                    ? '#c62828' 
                                    : warning.status === 'warning' 
                                      ? '#e65100' 
                                      : '#2e7d32',
                                border: `2px solid ${
                                  warning.status === 'danger' 
                                    ? '#f44336' 
                                    : warning.status === 'warning' 
                                      ? '#ff9800' 
                                      : '#4caf50'
                                }`,
                                animation: warning.status === 'danger' ? 'pulse 2s infinite' : 'none'
                              }}
                            >
                              {warning.message}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Compatibility Summary Alert */}
                {selectedHazards.length > 0 && (
                  <div 
                    className="compatibility-summary-alert"
                    style={{
                      marginTop: '2rem',
                      padding: '1.5rem',
                      borderRadius: '10px',
                      border: '2px solid',
                      borderColor: Object.values(hazardWarnings).some(w => w.status === 'danger')
                        ? '#f44336'
                        : Object.values(hazardWarnings).some(w => w.status === 'warning')
                          ? '#ff9800'
                          : '#4caf50',
                      backgroundColor: Object.values(hazardWarnings).some(w => w.status === 'danger')
                        ? '#ffebee'
                        : Object.values(hazardWarnings).some(w => w.status === 'warning')
                          ? '#fff3e0'
                          : '#e8f5e9',
                    }}
                  >
                    <h4 style={{
                      margin: '0 0 1rem 0',
                      color: Object.values(hazardWarnings).some(w => w.status === 'danger')
                        ? '#c62828'
                        : Object.values(hazardWarnings).some(w => w.status === 'warning')
                          ? '#e65100'
                          : '#2e7d32',
                    }}>
                      {Object.values(hazardWarnings).some(w => w.status === 'danger')
                        ? '🚫 INCOMPATIBLE HAZARDS DETECTED'
                        : Object.values(hazardWarnings).some(w => w.status === 'warning')
                          ? '⚠️ SEPARATION REQUIRED'
                          : '✅ ALL HAZARDS COMPATIBLE'
                      }
                    </h4>
                    <p style={{
                      margin: 0,
                      fontSize: '0.95rem',
                      color: '#666',
                    }}>
                      {Object.values(hazardWarnings).some(w => w.status === 'danger')
                        ? 'Some selected hazards MUST BE ISOLATED and cannot be stored in the same container. Please deselect incompatible hazards or create separate containers.'
                        : Object.values(hazardWarnings).some(w => w.status === 'warning')
                          ? 'Selected hazards can be stored together but require minimum separation distances. Continue to distance assessment for details.'
                          : 'All selected hazards are compatible and can be stored together. Continue to specify exact storage distances.'
                      }
                    </p>
                  </div>
                )}

                {/* Matrix Popup Button */}
                <MatrixPopupButton
                  selectedHazards={selectedHazards}
                  allHazards={hazardCategories}
                />

                {/* Hazard Pairs Assessment */}
                {hazardPairs.length > 0 && (
                  <div className="pairs-assessment">
                    <h3>Hazard Pair Compatibility Assessment</h3>
                    <p className="assessment-instructions">
                      Set the actual storage distance for each pair. The system will calculate safety status and show minimum required distances:
                    </p>
                    <div className="pairs-list">
                      {hazardPairs.map((pair, index) => {
                        // Get real-time status from backend API call
                        const pairKey = `${pair.hazard_category_a_id}-${pair.hazard_category_b_id}`;
                        const previewStatus = pairStatuses[pairKey] || { status: "unknown", is_isolated: false, min_required_distance: 0 };
                        const isolationStatus = getIsolationStatus(previewStatus.is_isolated, previewStatus.min_required_distance);
                        
                        return (
                          <div key={index} className="pair-assessment-item" style={getStatusColor(previewStatus.status)}>
                            <div className="pair-hazards">
                              <div className="hazard-item">
                                <strong>{getHazardName(pair.hazard_category_a_id)}</strong>
                              </div>
                              <div className="separator">↔</div>
                              <div className="hazard-item">
                                <strong>{getHazardName(pair.hazard_category_b_id)}</strong>
                              </div>
                            </div>
                            
                            <div className="pair-controls">
                              <div className="distance-control">
                                <label>
                                  Actual Distance (meters):
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={pair.distance}
                                    onChange={(e) => updatePairDistance(index, parseFloat(e.target.value) || 0)}
                                    placeholder="0.0"
                                    // STYLE ATTRIBUTE:
                                    style={{
                                      borderColor: (!pair.distance || pair.distance === 0) ? '#ff9800' : undefined,
                                      borderWidth: (!pair.distance || pair.distance === 0) ? '3px' : undefined,
                                      backgroundColor: (!pair.distance || pair.distance === 0) ? '#fff3e0' : undefined
                                    }}
                                  />
                                </label>
                              </div>
                              
                              {/* Live Status Preview */}
                              <div className="status-preview">
                                <div className="status-row">
                                  <span><strong>Required:</strong> {previewStatus.min_required_distance === null ? 'N/A' : `${previewStatus.min_required_distance}m`}</span>
                                  <span 
                                    className="isolation-badge"
                                    style={{ 
                                      backgroundColor: isolationStatus.bgColor, 
                                      color: isolationStatus.color,
                                      padding: '0.25rem 0.75rem',
                                      borderRadius: '15px',
                                      fontSize: '0.8rem',
                                      fontWeight: '700'
                                    }}
                                  >
                                    {isolationStatus.text}
                                  </span>
                                  <span className={`status-badge ${previewStatus.status}`}>
                                    {getStatusText(previewStatus.status)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Submit Section */}
                {selectedHazards.length > 0 && (
                  <div className="submit-section-bottom">
                    {hazardPairs.length === 0 && selectedHazards.length === 1 && (
                      <div className="single-hazard-notice">
                        <h3>Single Hazard Container</h3>
                        <p>This container contains only one type of hazard. Use the compatibility matrix above to review storage guidance with other chemicals.</p>
                      </div>
                    )}
                    
                    {/* ISOLATION WARNING */}
                    {(() => {
                      const isolationCheck = hasIsolationRequired();
                      if (isolationCheck.hasIsolation) {
                        return (
                          <div className="isolation-warning" style={{
                            background: '#ffebee',
                            border: '2px solid #f44336',
                            borderRadius: '10px',
                            padding: '1.5rem',
                            marginBottom: '2rem',
                            textAlign: 'center'
                          }}>
                            <h3 style={{ color: '#c62828', margin: '0 0 1rem 0' }}>
                              ⚠️ ISOLATION REQUIRED - SUBMISSION BLOCKED
                            </h3>
                            <p style={{ color: '#d32f2f', margin: '0', fontWeight: '600' }}>
                              The hazard pair "{isolationCheck.hazardA}" and "{isolationCheck.hazardB}" 
                              MUST BE ISOLATED and cannot be stored together in any container.
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {/* WARNING FOR EMPTY DISTANCES: */}
                    {hasEmptyDistances() && (
                      <div className="distance-warning" style={{
                        background: '#fff3e0',
                        border: '2px solid #ff9800',
                        borderRadius: '10px',
                        padding: '1.5rem',
                        marginBottom: '2rem',
                        textAlign: 'center'
                      }}>
                        <h3 style={{ color: '#e65100', margin: '0 0 1rem 0' }}>
                          ⚠️ INSUFFICIENT SAFETY DISTANCES
                        </h3>
                        <p style={{ color: '#f57c00', margin: '0', fontWeight: '600' }}>
                          One or more hazard pairs do not meet the required minimum safety distance. 
                          Please increase the distances until all pairs show "SAFE" status (green) above.
                        </p>
                      </div>
                    )}
                    
                    <div className="form-actions">
                      <button className="reset-btn" onClick={resetForm} type="button">
                        Reset Form
                      </button>
                      <button
                        className="submit-btn"
                        onClick={submitContainer}
                        disabled={loading || hasIsolationRequired().hasIsolation || hasEmptyDistances()}
                        style={{
                          opacity: (hasIsolationRequired().hasIsolation || hasEmptyDistances()) ? 0.4 : 1,
                          cursor: (hasIsolationRequired().hasIsolation || hasEmptyDistances()) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {loading ? 'Submitting Assessment...' : 'Submit Safety Assessment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'containers' && (
              <div className="containers-view">
                <h2>Container Safety Assessments</h2>
                <div className="containers-list">
                  {containers.length === 0 ? (
                    <div className="no-containers">
                      <p>No container assessments found.</p>
                      <button onClick={() => setActiveTab('form')}>Create New Assessment</button>
                    </div>
                  ) : (
                    containers.map(container => (
                      <div key={container.id} className="container-card">
                        <div className="container-header">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3>Container #{container.container}</h3>
                            <StatusBadge status={container.status} />
                          </div>
                          <div className="container-meta">
                            <span><strong>Department:</strong> {container.department}</span>
                            <span><strong>Location:</strong> {container.location}</span>
                            <span><strong>Container:</strong> {container.container}</span>
                            <span><strong>Type:</strong> {container.container_type}</span>
                            <span><strong>Submitted by:</strong> {container.submitted_by}</span>
                            <span><strong>Date:</strong> {new Date(container.submitted_at).toLocaleDateString()} - {new Date(container.submitted_at).toLocaleTimeString()}</span>
                            {container.approved_by && (
                              <span><strong>Approved by:</strong> {container.approved_by}</span>
                            )}
                            {container.approval_comment && (
                              <span><strong>Comments:</strong> {container.approval_comment}</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="container-hazards">
                          <h4>Hazards Present:</h4>
                          <div className="hazard-tags">
                            {container.hazards.map((hazard, idx) => (
                              <span key={idx} className="hazard-tag">
                                Class {hazard.hazard_class} - {hazard.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        
                        <div className="container-pairs">
                          <h4>Compatibility Assessment:</h4>
                          <div className="pairs-results">
                            {/* // In your App.tsx, update the container display section */}
                            {container.pairs.length === 0 ? (
                              <p style={{ fontStyle: 'italic', color: 'var(--kinross-dark-gray)' }}>
                                Single hazard container - no pairs to assess
                              </p>
                            ) : (
                              container.pairs.map(pair => {
                                const isolationStatus = getIsolationStatus(pair.is_isolated, pair.min_required_distance || 0);
                                return (
                                  <div key={pair.id} className="pair-result" style={getStatusColor(pair.status)}>
                                    <div className="pair-names">
                                      <span>{pair.hazard_a_name}</span>
                                      <span className="separator">↔</span>
                                      <span>{pair.hazard_b_name}</span>
                                    </div>
                                    <div className="pair-details">
                                      <span><strong>Actual:</strong> {pair.distance}m</span>
                                      <span>
                                        <strong>Required:</strong> {
                                          pair.min_required_distance === null 
                                            ? 'Must Be Isolated' 
                                            : `${pair.min_required_distance}m`
                                        }
                                      </span>
                                      <span 
                                        className="isolation-badge"
                                        style={{ 
                                          backgroundColor: isolationStatus.bgColor, 
                                          color: isolationStatus.color,
                                          padding: '0.25rem 0.75rem',
                                          borderRadius: '15px',
                                          fontSize: '0.8rem',
                                          fontWeight: '700'
                                        }}
                                      >
                                        {isolationStatus.text}
                                      </span>
                                      <span className={`status-badge ${pair.status}`}>
                                        {getStatusText(pair.status)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* PDF Download Button - Only for approved containers */}
                          {container.status === 'approved' && (
                            <div style={{ 
                              marginTop: '1.5rem', 
                              padding: '1rem', 
                              background: '#f9f9f9', 
                              borderRadius: '8px',
                              display: 'flex',
                              justifyContent: 'flex-end'
                            }}>
                              <button
                                onClick={() => generateContainerPDF(container, hazardCategories)}
                                style={{
                                  padding: '0.875rem 2rem',
                                  background: 'linear-gradient(135deg, var(--kinross-gold), var(--kinross-dark-gold))',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontWeight: '700',
                                  fontSize: '1rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  boxShadow: '0 4px 15px rgba(212, 165, 83, 0.3)',
                                  transition: 'all 0.3s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(212, 165, 83, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(212, 165, 83, 0.3)';
                                }}
                              >
                                <span style={{ fontSize: '1.2rem' }}>📄</span>
                                <span>Download Safety Label PDF</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* ADD THE DELETE BUTTON HERE (inside the container-card but after container-pairs): */}
                        {authState.user && authState.user.role === 'user' && container.submitted_by === authState.user.name && (
                          <div style={{ marginTop: '1rem', textAlign: 'right', padding: '0 2rem 2rem 2rem' }}>
                            <button
                              onClick={() => {
                                setSelectedContainerForDeletion(container.id);
                                setShowDeletionModal(true);
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                background: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }}
                            >
                              🗑️ Request Deletion
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {activeTab === 'approvals' && authState.user && (authState.user.role === 'hod' || authState.user.role === 'admin') && (
              <div className="containers-view">
                <h2>Pending Container Approvals</h2>
                <div className="containers-list">
                  {pendingContainers.length === 0 ? (
                    <div className="no-containers">
                      <p>No pending approvals.</p>
                    </div>
                  ) : (
                    pendingContainers.map(container => (
                      <div key={container.id} className="container-card">
                        <div className="container-header">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3>Container #{container.container}</h3>
                            <StatusBadge status={container.status} />
                          </div>
                          <div className="container-meta">
                            <span><strong>Department:</strong> {container.department}</span>
                            <span><strong>Location:</strong> {container.location}</span>
                            <span><strong>Container:</strong> {container.container}</span>
                            <span><strong>Submitted by:</strong> {container.submitted_by}</span>
                            <span><strong>Date:</strong> {new Date(container.submitted_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        
                        <div className="container-hazards">
                          <h4>Hazards Present:</h4>
                          <div className="hazard-tags">
                            {container.hazards.map((hazard, idx) => (
                              <span key={idx} className="hazard-tag">
                                Class {hazard.hazard_class} - {hazard.name}
                              </span>
                            ))}
                          </div>
                        </div>

                        {container.pairs && container.pairs.length > 0 && (
                          <div className="container-pairs">
                            <h4>Compatibility Assessment:</h4>
                            <div className="pairs-results">
                              {container.pairs.map(pair => {
                                const isolationStatus = getIsolationStatus(pair.is_isolated, pair.min_required_distance || 0);
                                return (
                                  <div key={pair.id} className="pair-result" style={getStatusColor(pair.status)}>
                                    <div className="pair-names">
                                      <span>{pair.hazard_a_name}</span>
                                      <span className="separator">↔</span>
                                      <span>{pair.hazard_b_name}</span>
                                    </div>
                                    <div className="pair-details">
                                      <span><strong>Actual:</strong> {pair.distance}m</span>
                                      <span>
                                        <strong>Required:</strong> {
                                          pair.min_required_distance === null 
                                            ? 'Must Be Isolated' 
                                            : `${pair.min_required_distance}m`
                                        }
                                      </span>
                                      <span 
                                        className="isolation-badge"
                                        style={{ 
                                          backgroundColor: isolationStatus.bgColor, 
                                          color: isolationStatus.color,
                                          padding: '0.25rem 0.75rem',
                                          borderRadius: '15px',
                                          fontSize: '0.8rem',
                                          fontWeight: '700'
                                        }}
                                      >
                                        {isolationStatus.text}
                                      </span>
                                      <span className={`status-badge ${pair.status}`}>
                                        {getStatusText(pair.status)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f9f9f9', borderRadius: '8px' }}>
                          <h4>{authState.user?.role === 'hod' ? 'HOD Actions:' : 'Admin Actions:'}</h4>
                          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setApprovalModal({ 
                                isOpen: true, 
                                type: 'approve', 
                                containerId: container.id 
                              })}
                              style={{
                                padding: '0.75rem 1.5rem',
                                background: '#4caf50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }}
                            >
                              ✅ Approve
                            </button>
                            <button
                              onClick={() => setApprovalModal({ 
                                isOpen: true, 
                                type: 'reject', 
                                containerId: container.id 
                              })}
                              style={{
                                padding: '0.75rem 1.5rem',
                                background: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }}
                            >
                              ❌ Reject
                            </button>
                            <button
                              onClick={() => deleteContainer(container.id, container.container)}
                              style={{
                                padding: '0.75rem 1.5rem',
                                background: '#9e9e9e',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ✅ ADD THIS NEW ADMIN REVIEW TAB: */}
            {activeTab === 'admin-deletions' && authState.user?.role === 'admin' && (
              <div className="containers-view">
                <h2>🔍 Deletion Requests - Admin Review</h2>
                <p style={{ 
                  textAlign: 'center', 
                  color: 'var(--kinross-dark-gray)', 
                  marginBottom: '2rem',
                  fontSize: '1.1rem'
                }}>
                  Review user deletion requests and provide recommendations to HOD
                </p>

                <div className="containers-list">
                  {deletionRequests.length === 0 ? (
                    <div className="no-containers">
                      <p>No pending deletion requests for admin review.</p>
                    </div>
                  ) : (
                    deletionRequests.map(request => (
                      <div key={request.id} className="container-card" style={{
                        borderLeft: '5px solid #2196F3'
                      }}>
                        <div className="container-header">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3>🔍 Deletion Request - Container #{request.container}</h3>
                            <span style={{
                              padding: '0.5rem 1rem',
                              background: '#e3f2fd',
                              color: '#1565C0',
                              borderRadius: '20px',
                              fontSize: '0.85rem',
                              fontWeight: '700'
                            }}>
                              AWAITING ADMIN REVIEW
                            </span>
                          </div>
                          
                          <div className="container-meta" style={{ marginTop: '1rem' }}>
                            <span><strong>Container ID:</strong> {request.container}</span>
                            <span><strong>Department:</strong> {request.department}</span>
                            <span><strong>Location:</strong> {request.location}</span>
                            <span><strong>Type:</strong> {request.container_type}</span>
                            <span><strong>Current Status:</strong> {request.container_status}</span>
                            <span><strong>Originally Submitted By:</strong> {request.submitted_by}</span>
                          </div>
                        </div>

                        <div style={{
                          marginTop: '1.5rem',
                          padding: '1.5rem',
                          background: '#e3f2fd',
                          borderRadius: '8px',
                          border: '2px solid #2196F3'
                        }}>
                          <h4 style={{ 
                            margin: '0 0 1rem 0', 
                            color: '#1565C0',
                            fontSize: '1.1rem'
                          }}>
                            User's Deletion Request
                          </h4>
                          <div style={{ marginBottom: '1rem' }}>
                            <strong style={{ color: '#1976D2' }}>Requested By:</strong> {request.requested_by} ({request.requested_by_email})
                          </div>
                          <div style={{ marginBottom: '1rem' }}>
                            <strong style={{ color: '#1976D2' }}>Request Date:</strong> {new Date(request.request_date).toLocaleString()}
                          </div>
                          <div>
                            <strong style={{ color: '#1976D2' }}>User's Reason:</strong>
                            <p style={{ 
                              margin: '0.5rem 0 0 0', 
                              padding: '1rem',
                              background: 'white',
                              borderRadius: '6px',
                              border: '1px solid #90caf9',
                              color: '#333',
                              lineHeight: '1.6'
                            }}>
                              {request.request_reason}
                            </p>
                          </div>
                        </div>

                        <div style={{ 
                          marginTop: '1.5rem', 
                          padding: '1.5rem', 
                          background: '#f9f9f9', 
                          borderRadius: '8px' 
                        }}>
                          <h4 style={{ margin: '0 0 1rem 0', color: 'var(--kinross-navy)' }}>
                            Admin Review Required
                          </h4>
                          <p style={{ 
                            margin: '0 0 1rem 0', 
                            color: '#666', 
                            fontSize: '0.95rem' 
                          }}>
                            Review the deletion request and provide your recommendation to the HOD.
                          </p>
                          <button
                            onClick={() => {
                              setSelectedRequestForReview(request);
                              setShowAdminReviewModal(true);
                            }}
                            style={{
                              padding: '0.875rem 2rem',
                              background: 'linear-gradient(135deg, #2196F3, #1976D2)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: '700',
                              fontSize: '1rem',
                              boxShadow: '0 4px 15px rgba(33, 150, 243, 0.3)'
                            }}
                          >
                            📋 Review & Forward to HOD
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* NEW TAB: for HOD Pending Deletions Requests */}
            {activeTab === 'deletions' && authState.user?.role === 'hod' && (
              <div className="containers-view">
                <h2>🗑️ Pending Deletion Requests - HOD Final Decision</h2>
                <p style={{ 
                  textAlign: 'center', 
                  color: 'var(--kinross-dark-gray)', 
                  marginBottom: '2rem',
                  fontSize: '1.1rem'
                }}>
                  Make final decision on admin-reviewed deletion requests
                </p>

                <div className="containers-list">
                  {deletionRequests.length === 0 ? (
                    <div className="no-containers">
                      <p>No deletion requests awaiting HOD decision.</p>
                    </div>
                  ) : (
                    deletionRequests.map(request => (
                      <div key={request.id} className="container-card" style={{
                        borderLeft: '5px solid #f44336'
                      }}>
                        {/* Container Header - same as before */}
                        <div className="container-header">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3>🗑️ Deletion Request - Container #{request.container}</h3>
                            <span style={{
                              padding: '0.5rem 1rem',
                              background: '#fff3e0',
                              color: '#e65100',
                              borderRadius: '20px',
                              fontSize: '0.85rem',
                              fontWeight: '700'
                            }}>
                              AWAITING HOD DECISION
                            </span>
                          </div>
                          
                          <div className="container-meta" style={{ marginTop: '1rem' }}>
                            <span><strong>Container ID:</strong> {request.container}</span>
                            <span><strong>Department:</strong> {request.department}</span>
                            <span><strong>Location:</strong> {request.location}</span>
                            <span><strong>Type:</strong> {request.container_type}</span>
                            <span><strong>Current Status:</strong> {request.container_status}</span>
                            <span><strong>Originally Submitted By:</strong> {request.submitted_by}</span>
                          </div>
                        </div>

                        {/* User's Request */}
                        <div style={{
                          marginTop: '1.5rem',
                          padding: '1.5rem',
                          background: '#ffebee',
                          borderRadius: '8px',
                          border: '2px solid #f44336'
                        }}>
                          <h4 style={{ 
                            margin: '0 0 1rem 0', 
                            color: '#c62828',
                            fontSize: '1.1rem'
                          }}>
                            User's Deletion Request
                          </h4>
                          <div style={{ marginBottom: '1rem' }}>
                            <strong style={{ color: '#d32f2f' }}>Requested By:</strong> {request.requested_by} ({request.requested_by_email})
                          </div>
                          <div style={{ marginBottom: '1rem' }}>
                            <strong style={{ color: '#d32f2f' }}>Request Date:</strong> {new Date(request.request_date).toLocaleString()}
                          </div>
                          <div>
                            <strong style={{ color: '#d32f2f' }}>User's Reason:</strong>
                            <p style={{ 
                              margin: '0.5rem 0 0 0', 
                              padding: '1rem',
                              background: 'white',
                              borderRadius: '6px',
                              border: '1px solid #ef9a9a',
                              color: '#333',
                              lineHeight: '1.6'
                            }}>
                              {request.request_reason}
                            </p>
                          </div>
                        </div>

                        {/* ✅ ADD ADMIN REVIEW INFO: */}
                        {request.admin_reviewed && (
                          <div style={{
                            marginTop: '1.5rem',
                            padding: '1.5rem',
                            background: '#e3f2fd',
                            borderRadius: '8px',
                            border: '2px solid #2196F3'
                          }}>
                            <h4 style={{ 
                              margin: '0 0 1rem 0', 
                              color: '#1565C0',
                              fontSize: '1.1rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              📋 Admin Review Completed
                            </h4>
                            <div style={{ marginBottom: '1rem' }}>
                              <strong style={{ color: '#1976D2' }}>Reviewed By:</strong> {request.admin_reviewer}
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                              <strong style={{ color: '#1976D2' }}>Review Date:</strong> {request.admin_review_date ? new Date(request.admin_review_date).toLocaleString() : 'N/A'}
                            </div>
                            <div>
                              <strong style={{ color: '#1976D2' }}>Admin's Comments & Recommendation:</strong>
                              <p style={{ 
                                margin: '0.5rem 0 0 0', 
                                padding: '1rem',
                                background: 'white',
                                borderRadius: '6px',
                                border: '1px solid #90caf9',
                                color: '#333',
                                lineHeight: '1.6',
                                fontWeight: '600'
                              }}>
                                {request.admin_review_comment}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* HOD Action Buttons */}
                        <div style={{ 
                          marginTop: '1.5rem', 
                          padding: '1.5rem', 
                          background: '#f9f9f9', 
                          borderRadius: '8px' 
                        }}>
                          <h4 style={{ margin: '0 0 1rem 0', color: 'var(--kinross-navy)' }}>
                            HOD Final Decision - Action Required
                          </h4>
                          <div style={{ 
                            display: 'flex', 
                            gap: '1rem', 
                            marginTop: '1rem', 
                            flexWrap: 'wrap' 
                          }}>
                            <button
                              onClick={() => setApprovalModal({ 
                                isOpen: true, 
                                type: 'approve', 
                                containerId: request.id
                              })}
                              style={{
                                padding: '0.75rem 1.5rem',
                                background: '#4caf50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '1rem'
                              }}
                            >
                              ✅ Approve Deletion
                            </button>
                            <button
                              onClick={() => setApprovalModal({ 
                                isOpen: true, 
                                type: 'reject', 
                                containerId: request.id
                              })}
                              style={{
                                padding: '0.75rem 1.5rem',
                                background: '#ff9800',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '1rem'
                              }}
                            >
                              ❌ Reject Deletion
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {activeTab === 'analytics' && authState.user?.role === 'hod' && (
              <div className="containers-view">
                <h2>📊 Analytics Dashboard</h2>
                <p style={{ 
                  textAlign: 'center', 
                  color: 'var(--kinross-dark-gray)', 
                  marginBottom: '2rem',
                  fontSize: '1.1rem'
                }}>
                  Container safety assessments statistics and insights
                </p>

                {/* Filters */}
                <div style={{
                  background: 'var(--kinross-light-gray)',
                  borderRadius: '12px',
                  padding: '2rem',
                  marginBottom: '2rem',
                  border: '1px solid var(--kinross-medium-gray)'
                }}>
                  <h3 style={{ color: 'var(--kinross-navy)', marginBottom: '1.5rem' }}>🔍 Filters</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* First Row: Department, Submitted By, Container Type */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '1rem'
                    }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                          Department
                          <select
                            value={analyticsFilters.department}
                            onChange={(e) => setAnalyticsFilters({...analyticsFilters, department: e.target.value})}
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              marginTop: '0.25rem',
                              border: '2px solid var(--kinross-medium-gray)',
                              borderRadius: '6px',
                              fontSize: '0.95rem'
                            }}
                          >
                            <option value="">All Departments</option>
                            {getUniqueValues('department').map(dept => (
                              <option key={dept} value={dept}>{dept}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                          Submitted By
                          <select
                            value={analyticsFilters.submitter}
                            onChange={(e) => setAnalyticsFilters({...analyticsFilters, submitter: e.target.value})}
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              marginTop: '0.25rem',
                              border: '2px solid var(--kinross-medium-gray)',
                              borderRadius: '6px',
                              fontSize: '0.95rem'
                            }}
                          >
                            <option value="">All Submitters</option>
                            {getUniqueValues('submitted_by').map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                          Container Type
                          <select
                            value={analyticsFilters.containerType}
                            onChange={(e) => setAnalyticsFilters({...analyticsFilters, containerType: e.target.value})}
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              marginTop: '0.25rem',
                              border: '2px solid var(--kinross-medium-gray)',
                              borderRadius: '6px',
                              fontSize: '0.95rem'
                            }}
                          >
                            <option value="">All Types</option>
                            {getUniqueValues('container_type').map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    {/* Second Row: Start Date, End Date, Reset Button */}
                    <div style={{
                      display: 'flex',
                      gap: '1rem',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ flex: '1', minWidth: '150px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                          Start Date
                          <input
                            type="date"
                            value={analyticsFilters.startDate}
                            onChange={(e) => setAnalyticsFilters({...analyticsFilters, startDate: e.target.value})}
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              marginTop: '0.25rem',
                              border: '2px solid var(--kinross-medium-gray)',
                              borderRadius: '6px',
                              fontSize: '0.95rem',
                              boxSizing: 'border-box'
                            }}
                          />
                        </label>
                      </div>

                      <div style={{ flex: '1', minWidth: '150px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                          End Date
                          <input
                            type="date"
                            value={analyticsFilters.endDate}
                            onChange={(e) => setAnalyticsFilters({...analyticsFilters, endDate: e.target.value})}
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              marginTop: '0.25rem',
                              border: '2px solid var(--kinross-medium-gray)',
                              borderRadius: '6px',
                              fontSize: '0.95rem',
                              boxSizing: 'border-box'
                            }}
                          />
                        </label>
                      </div>

                      <div style={{ flex: '1', minWidth: '150px', display: 'flex', flexDirection: 'column' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem', visibility: 'hidden' }}>
                          Actions
                        </label>
                        <button
                          onClick={() => setAnalyticsFilters({
                            department: '',
                            submitter: '',
                            containerType: '',
                            startDate: '',
                            endDate: ''
                          })}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            marginTop: '0.25rem',
                            background: 'var(--kinross-gold)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '1rem',
                            boxSizing: 'border-box',
                            height: '46px'
                          }}
                        >
                          🔄 Reset Filters
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts */}
                {analyticsLoading ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="loading-spinner" style={{
                      width: '50px',
                      height: '50px',
                      border: '5px solid var(--kinross-light-gray)',
                      borderTop: '5px solid var(--kinross-gold)',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto 1rem'
                    }}></div>
                    <p style={{ color: 'var(--kinross-dark-gray)' }}>Loading analytics...</p>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', // replace with minmax(300px, 1fr) to fit chart in phone
                    gap: '2rem'
                  }}>
                    <DonutChart
                      data={getDepartmentStats()}
                      title="📁 By Department"
                      colors={['#D4A553', '#1E3A5F', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#009688', '#FF5722', '#795548']}
                    />
                    <DonutChart
                      data={getLocationStats()}
                      title="📍 By Location"
                      colors={['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#D4A553', '#1E3A5F', '#F44336', '#009688', '#FF5722', '#795548']}
                    />
                    <DonutChart
                      data={getSubstanceStats()}
                      title="⚗️ By Hazard Classes"
                      colors={['#F44336', '#FF9800', '#FF5722', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFC107']}
                    />
                    <DonutChart
                      data={getStatusStats()}
                      title="✅ By Container Status"
                      colors={['#4CAF50', '#FF9800', '#F44336']} // Approved=Green, Pending=Orange, Rejected=Red
                    />
                  </div>
                )}
              </div>
            )}
            {activeTab === 'users' && authState.user && (authState.user.role === 'hod' || authState.user.role === 'admin') && (
              <div className="containers-view">
                <h2>👥 User Management</h2>
                <p style={{ 
                  textAlign: 'center', 
                  color: 'var(--kinross-dark-gray)', 
                  marginBottom: '2rem',
                  fontSize: '1.1rem'
                }}>
                  Manage system users, roles, and permissions
                </p>

                {/* Add User Button */}
                <div style={{ marginBottom: '2rem', textAlign: 'right' }}>
                  <button
                    onClick={() => {
                      setEditingUser(null);
                      setUserFormData({ email: '', name: '', role: 'user', department: '', active: true });
                      setShowUserModal(true);
                    }}
                    style={{
                      padding: '1rem 2rem',
                      background: 'linear-gradient(135deg, var(--kinross-gold), var(--kinross-dark-gold))',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '700',
                      fontSize: '1rem',
                      boxShadow: '0 4px 15px rgba(212, 165, 83, 0.3)'
                    }}
                  >
                    ➕ Add New User
                  </button>
                </div>

                {/* Users Table */}
                <div style={{
                  background: 'var(--kinross-white)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 15px rgba(30, 58, 95, 0.1)',
                  border: '1px solid var(--kinross-medium-gray)'
                }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse'
                  }}>
                    <thead>
                      <tr style={{
                        background: 'linear-gradient(135deg, var(--kinross-navy), var(--kinross-dark-navy))',
                        color: 'white'
                      }}>
                        <th style={{ padding: '1rem', textAlign: 'left' }}>Name</th>
                        <th style={{ padding: '1rem', textAlign: 'left' }}>Email</th>
                        <th style={{ padding: '1rem', textAlign: 'left' }}>Role</th>
                        <th style={{ padding: '1rem', textAlign: 'left' }}>Department</th>
                        <th style={{ padding: '1rem', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '1rem', textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user, idx) => (
                        <tr key={user.id} style={{
                          background: idx % 2 === 0 ? 'white' : 'var(--kinross-light-gray)',
                          borderBottom: '1px solid var(--kinross-medium-gray)'
                        }}>
                          <td style={{ padding: '1rem' }}>
                            <strong>{user.name}</strong>
                          </td>
                          <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                            {user.email}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              borderRadius: '15px',
                              fontSize: '0.85rem',
                              fontWeight: '600',
                              background: user.role === 'hod' ? '#E3F2FD' : user.role === 'admin' ? '#FFF3E0' : '#E8F5E8',
                              color: user.role === 'hod' ? '#1565C0' : user.role === 'admin' ? '#E65100' : '#2E7D32'
                            }}>
                              {user.role.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                            {user.department}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              borderRadius: '15px',
                              fontSize: '0.85rem',
                              fontWeight: '600',
                              background: user.active ? '#E8F5E8' : '#FFEBEE',
                              color: user.active ? '#2E7D32' : '#C62828'
                            }}>
                              {user.active ? '✓ Active' : '✗ Inactive'}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button
                              onClick={() => {
                                setEditingUser(user);
                                setUserFormData({
                                  email: user.email,
                                  name: user.name,
                                  role: user.role,
                                  department: user.department,
                                  active: user.active
                                });
                                setShowUserModal(true);
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                background: '#2196F3',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: '600'
                              }}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => toggleUserActive(user.id, user.active)}
                              disabled={user.id === authState.user?.id}
                              style={{
                                padding: '0.5rem 1rem',
                                background: user.active ? '#FF9800' : '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: user.id === authState.user?.id ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                opacity: user.id === authState.user?.id ? 0.5 : 1
                              }}
                            >
                              {user.active ? '🔒 Deactivate' : '🔓 Activate'}
                            </button>
                            <button
                              onClick={() => deleteUser(user.id, user.name)}
                              disabled={user.id === authState.user?.id}
                              style={{
                                padding: '0.5rem 1rem',
                                background: '#F44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: user.id === authState.user?.id ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                opacity: user.id === authState.user?.id ? 0.5 : 1
                              }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {users.length === 0 && (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--kinross-dark-gray)' }}>
                    No users found
                  </div>
                )}
              </div>
            </div>
            )}
          </main>

          <footer className="kinross-footer">
            <p>© 2025 Kinross Gold Corporation - Chemical Container Safety Management System</p>
          </footer>

          {/* Approval Comment MODAL: */}
          <ApprovalCommentModal
            isOpen={approvalModal.isOpen}
            onClose={() => setApprovalModal({ ...approvalModal, isOpen: false })}
            onSubmit={(comment) => {
              // Check if we're in deletion tab (HOD final decision)
              if (activeTab === 'deletions') {
                hodFinalDecision(
                  approvalModal.containerId,
                  approvalModal.type === 'approve' ? 'approved' : 'rejected',
                  comment
                );
              } else {
                // Container approval
                approveContainer(
                  approvalModal.containerId, 
                  approvalModal.type === 'approve' ? 'approved' : 'rejected', 
                  comment
                );
              }
            }}
            type={approvalModal.type}
          />

          <AdminReviewModal
            isOpen={showAdminReviewModal}
            onClose={() => {
              setShowAdminReviewModal(false);
              setSelectedRequestForReview(null);
            }}
            onSubmit={(comment, recommendation) => {
              if (selectedRequestForReview) {
                adminReviewDeletion(selectedRequestForReview.id, comment, recommendation);
              }
            }}
            request={selectedRequestForReview}
          />

          {/* DELETION REQUEST MODAL: */}
          <DeletionRequestModal
            isOpen={showDeletionModal}
            onClose={() => {
              setShowDeletionModal(false);
              setSelectedContainerForDeletion(null);
              setDeletionReason('');
            }}
            onSubmit={(reason) => {
              if (selectedContainerForDeletion) {
                requestContainerDeletion(selectedContainerForDeletion, reason);
              }
            }}
            containerName={
              selectedContainerForDeletion 
                ? containers.find(c => c.id === selectedContainerForDeletion)?.container || ''
                : ''
            }
          />

          {/* User Management Modal */}
          {showUserModal && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(30, 58, 95, 0.8)',
              backdropFilter: 'blur(5px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem'
            }} onClick={() => setShowUserModal(false)}>
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '2rem',
                maxWidth: '600px',
                width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
              }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--kinross-navy)' }}>
                  {editingUser ? '✏️ Edit User' : '➕ Add New User'}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                      Email *
                      <input
                        type="email"
                        value={userFormData.email}
                        onChange={(e) => setUserFormData({...userFormData, email: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '2px solid var(--kinross-medium-gray)',
                          borderRadius: '6px',
                          fontSize: '1rem',
                          marginTop: '0.25rem',
                          boxSizing: 'border-box'
                        }}
                        placeholder="user@kinross.com"
                      />
                    </label>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                      Full Name *
                      <input
                        type="text"
                        value={userFormData.name}
                        onChange={(e) => setUserFormData({...userFormData, name: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '2px solid var(--kinross-medium-gray)',
                          borderRadius: '6px',
                          fontSize: '1rem',
                          marginTop: '0.25rem',
                          boxSizing: 'border-box'
                        }}
                        placeholder="John Doe"
                      />
                    </label>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                      Role *
                      <select
                        value={userFormData.role}
                        onChange={(e) => setUserFormData({...userFormData, role: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '2px solid var(--kinross-medium-gray)',
                          borderRadius: '6px',
                          fontSize: '1rem',
                          marginTop: '0.25rem',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="hod">HOD</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </label>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                      Department *
                      <select
                        value={userFormData.department}
                        onChange={(e) => setUserFormData({...userFormData, department: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '2px solid var(--kinross-medium-gray)',
                          borderRadius: '6px',
                          fontSize: '1rem',
                          marginTop: '0.25rem',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="">Select department</option>
                        {DEPARTMENTS.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {editingUser && (
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
                        <input
                          type="checkbox"
                          checked={userFormData.active}
                          onChange={(e) => setUserFormData({...userFormData, active: e.target.checked})}
                          style={{ width: '20px', height: '20px' }}
                        />
                        Active User
                      </label>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setShowUserModal(false);
                      setEditingUser(null);
                      setUserFormData({ email: '', name: '', role: 'user', department: '', active: true });
                    }}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: 'transparent',
                      color: '#666',
                      border: '2px solid #ccc',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={editingUser ? updateUser : createUser}
                    disabled={!userFormData.email || !userFormData.name || !userFormData.department}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: 'var(--kinross-gold)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: !userFormData.email || !userFormData.name || !userFormData.department ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      opacity: !userFormData.email || !userFormData.name || !userFormData.department ? 0.5 : 1
                    }}
                  >
                    {editingUser ? '💾 Update User' : '➕ Create User'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Success Modal */}
      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        containerName={submittedContainerName}
      />
    </div>
  );
}

export default App;