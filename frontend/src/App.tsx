import React, { useState, useEffect } from 'react';
import './App.css';

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
  role: 'admin' | 'user' | 'viewer';
  department: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
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
  const [activeTab, setActiveTab] = useState<'form' | 'containers' | 'approvals'>('form');
  const [loading, setLoading] = useState(false);
  const [pairStatuses, setPairStatuses] = useState<{[key: string]: any}>({});
  const [pendingContainers, setPendingContainers] = useState<ContainerData[]>([]);

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
    console.log('API BASE:', API_BASE);
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
        alert(`Container safety assessment submitted successfully!\nContainer ID: ${result.container_id}`);
        
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
        width: '450px',                // ✅ Changed from minWidth/maxWidth
        maxWidth: '90vw',              // ✅ Responsive
        boxSizing: 'border-box',       // ✅ Added
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
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
              {/* // Fix for verification code input */}
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
                  letterSpacing: '0.5rem'
                }}
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus  // Add this line
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
              {authState.user && (authState.user.role === 'admin' || authState.user.role === 'user') && (
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
              {authState.user?.role === 'admin' && (
                <button 
                  className={activeTab === 'approvals' ? 'active' : ''}
                  onClick={() => {
                    setActiveTab('approvals');
                    if (authState.user?.role === 'admin') {
                      fetchPendingContainers(); // Add this line
                    }
                  }}
                >
                  <span>Pending Approvals</span>
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
                            <span><strong>Date:</strong> {new Date(container.submitted_at).toLocaleDateString()}</span>
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
                        </div>

                        {/* ADD THE DELETE BUTTON HERE (inside the container-card but after container-pairs): */}
                        {authState.user?.role === 'admin' && (
                          <div style={{ marginTop: '1rem', textAlign: 'right', padding: '0 2rem 2rem 2rem' }}>
                            <button
                              onClick={() => deleteContainer(container.id, container.container)}
                              style={{
                                padding: '0.5rem 1rem',
                                background: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                cursor: 'pointer'
                              }}
                            >
                              🗑️ Delete Container
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {activeTab === 'approvals' && authState.user?.role === 'admin' && (
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
                          <h4>Admin Actions:</h4>
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
          </main>

          <footer className="kinross-footer">
            <p>© 2025 Kinross Gold Corporation - Chemical Container Safety Management System</p>
          </footer>

          <ApprovalCommentModal
            isOpen={approvalModal.isOpen}
            onClose={() => setApprovalModal({ ...approvalModal, isOpen: false })}
            onSubmit={(comment) => {
              approveContainer(
                approvalModal.containerId, 
                approvalModal.type === 'approve' ? 'approved' : 'rejected', 
                comment
              );
            }}
            type={approvalModal.type}
          />
        </>
      )}
    </div>
  );
}

export default App;