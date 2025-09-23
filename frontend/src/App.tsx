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

const API_BASE = 'http://localhost:8000';

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

// Function to generate container ID
const generateContainerID = async (): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE}/generate-container-id/`);
    if (response.ok) {
      const data = await response.json();
      return data.container_id;
    }
  } catch (error) {
    console.error('Error generating container ID:', error);
  }
  
  // Fallback generation
  const timestamp = Date.now().toString().slice(-4);
  const letters = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + 
                  String.fromCharCode(65 + Math.floor(Math.random() * 26)) + 
                  String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `CONT-${timestamp}-${letters}`;
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

function App() {
  const [hazardCategories, setHazardCategories] = useState<HazardCategory[]>([]);
  const [selectedHazards, setSelectedHazards] = useState<HazardCategory[]>([]);
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [submittedBy, setSubmittedBy] = useState('');
  const [container, setContainer] = useState('');
  const [containerType, setContainerType] = useState('');
  const [hazardPairs, setHazardPairs] = useState<HazardPairData[]>([]);
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [activeTab, setActiveTab] = useState<'form' | 'containers'>('form');
  const [loading, setLoading] = useState(false);
  const [pairStatuses, setPairStatuses] = useState<{[key: string]: any}>({});

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

  useEffect(() => {
    checkAuthStatus(); // Check auth first
    fetchHazardCategories();
    fetchContainers();
  }, []);

  // ADD THIS NEW useEffect:
  useEffect(() => {
    // Generate container ID when component mounts
    if (!container) {
      generateContainerID().then(setContainer);
    }
  }, []);

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
      const response = await fetch(`${API_BASE}/containers/`);
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
    
    if (isSelected) {
      newSelected = selectedHazards.filter(h => h.id !== category.id);
    } else {
      newSelected = [...selectedHazards, category];
    }
    
    setSelectedHazards(newSelected);
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

  // ADD THIS NEW FUNCTION HERE: to isolate required hazards which can not goes with each other
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

  const submitContainer = async () => {
    if (!department.trim() || !location.trim() || !submittedBy.trim() || !container.trim() || !containerType.trim()) {
      alert('Please fill in all required fields (Department, Location, Submitted By, Container, Type)');
      return;
    }
    
    if (selectedHazards.length === 0) {
      alert('Please select at least one hazard category');
      return;
    }

    // ADD THIS VALIDATION CHECK:
    const isolationCheck = hasIsolationRequired();
    if (isolationCheck.hasIsolation) {
      alert(`⚠️ SUBMISSION BLOCKED\n\nThe hazard pair "${isolationCheck.hazardA}" and "${isolationCheck.hazardB}" MUST BE ISOLATED and cannot be stored in the same container.\n\nThese chemicals require complete separation and cannot be combined in any container configuration.`);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/containers/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          department,
          location,
          submitted_by: submittedBy,
          container,
          container_type: containerType,
          selected_hazards: selectedHazards.map(h => h.id),
          hazard_pairs: hazardPairs
        }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Container safety assessment submitted successfully!\nContainer ID: ${result.container_id}`);
        
        // Reset form
        setDepartment('');
        setLocation('');
        setSubmittedBy('');
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
    setDepartment('');
    setLocation('');
    setSubmittedBy('');
    setContainerType('');
    setSelectedHazards([]);
    setHazardPairs([]);
    setPairStatuses({});
    
    // Generate new container ID when resetting
    const newId = await generateContainerID();
    setContainer(newId);
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
        minWidth: '400px',
        maxWidth: '500px',
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
            <label style={{ display: 'block', marginBottom: '1rem', fontWeight: '600' }}>
              Corporate Email Address:
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="your.name@kinross.com"
                style={{
                  width: '100%',
                  padding: '1rem',
                  marginTop: '0.5rem',
                  border: '2px solid var(--kinross-medium-gray)',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
                onKeyPress={(e) => e.key === 'Enter' && requestVerificationCode()}
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
                  letterSpacing: '0.5rem'
                }}
                maxLength={6}
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
              {/* UPDATE NAVIGATION WITH ROLE CHECKS */}
              {authState.user && (authState.user.role === 'admin' || authState.user.role === 'user') && (
                <button 
                  className={activeTab === 'form' ? 'active' : ''}
                  onClick={() => setActiveTab('form')}
                >
                  <span>New Container Assessment</span>
                </button>
              )}
              {authState.user && (
                <button 
                  className={activeTab === 'containers' ? 'active' : ''}
                  onClick={() => setActiveTab('containers')}
                >
                  <span>View Assessments</span>
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
                          value={submittedBy}
                          onChange={(e) => setSubmittedBy(e.target.value)}
                          placeholder="Your full name"
                          required
                        />
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
                            placeholder="Auto-generated container ID"
                            required
                            style={{ 
                              flex: 1,
                              backgroundColor: '#f5f5f5',
                              cursor: 'not-allowed',
                              color: '#666'
                            }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const newId = await generateContainerID();
                              setContainer(newId);
                            }}
                            style={{
                              padding: '0.75rem 1rem',
                              background: 'var(--kinross-gold)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Generate New
                          </button>
                        </div>
                        <small style={{ 
                          color: 'var(--kinross-dark-gray)', 
                          fontSize: '0.85rem',
                          fontStyle: 'italic',
                          marginTop: '0.25rem',
                          display: 'block'
                        }}>
                          Container ID is auto-generated. Click "Generate New" for a different ID.
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

                {/* Hazard Selection */}
                <div className="hazard-selection">
                  <h3>Select DOT Hazard Classes Present in Container</h3>
                  <div className="ghs-grid">
                    {hazardCategories.map(category => (
                      <div
                        key={category.id}
                        className={`ghs-card ${selectedHazards.find(h => h.id === category.id) ? 'selected' : ''}`}
                        onClick={() => handleHazardSelect(category)}
                      >
                        {category.logo_path ? (
                          <img
                            src={`${API_BASE}${category.logo_path}`}
                            alt={category.name}
                            className="ghs-logo"
                          />
                        ) : (
                          <div className="ghs-symbol">Class {category.hazard_class}</div>
                        )}
                        <div className="ghs-name">{category.name}</div>
                        <div className="ghs-code">Class {category.subclass}</div>
                        {category.description && (
                          <div className="ghs-description">{category.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

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
                    
                    {/* ADD THIS ISOLATION WARNING */}
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
                    
                    <div className="form-actions">
                      <button className="reset-btn" onClick={resetForm} type="button">
                        Reset Form
                      </button>
                      <button
                        className="submit-btn"
                        onClick={submitContainer}
                        disabled={loading || hasIsolationRequired().hasIsolation}
                        style={{
                          opacity: hasIsolationRequired().hasIsolation ? 0.4 : 1,
                          cursor: hasIsolationRequired().hasIsolation ? 'not-allowed' : 'pointer'
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
                          <h3>Container #{container.id}</h3>
                          <div className="container-meta">
                            <span><strong>Department:</strong> {container.department}</span>
                            <span><strong>Location:</strong> {container.location}</span>
                            <span><strong>Container:</strong> {container.container}</span>
                            <span><strong>Type:</strong> {container.container_type}</span>
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
        </>
      )}
    </div>
  );
}

export default App;