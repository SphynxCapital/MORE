import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenerativeAI } from '@google/genai';

const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'; // Replace with your actual key

class SpeechSynthesisManager {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.selectedVoice = null;
        this.synth.onvoiceschanged = () => this.loadVoices();
        this.loadVoices();
    }

    loadVoices() {
        this.voices = this.synth.getVoices();
        this.selectedVoice = this.voices.find(v => v.lang === 'en-GB' && v.name.includes('Female')) || this.voices.find(v => v.lang === 'en-GB') || null;
    }

    speak(text, onEndCallback = () => {}) {
        if (this.synth.speaking) {
            this.synth.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.selectedVoice;
        utterance.pitch = 1;
        utterance.rate = 1;
        utterance.volume = 1;
        utterance.onend = onEndCallback;
        this.synth.speak(utterance);
    }

    pause() { this.synth.pause(); }
    resume() { this.synth.resume(); }
    stop() { this.synth.cancel(); }
}

// --- Main Application Component ---
const MnemoApp = () => {
    const [appState, setAppState] = useState('landing'); // landing, analyzing, dashboard
    const [analysisData, setAnalysisData] = useState(null);
    const [chatHistory, setChatHistory] = useState([]);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const speechManager = useRef(new SpeechSynthesisManager()).current;

    useEffect(() => {
        const savedState = localStorage.getItem('mnemoAppState');
        if (savedState) {
            const { appState, analysisData, chatHistory } = JSON.parse(savedState);
            setAppState(appState);
            setAnalysisData(analysisData);
            setChatHistory(chatHistory);
        }
    }, []);

    useEffect(() => {
        if (appState !== 'landing') {
            const stateToSave = { appState, analysisData, chatHistory };
            localStorage.setItem('mnemoAppState', JSON.stringify(stateToSave));
        }
    }, [appState, analysisData, chatHistory]);

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const logToServer = (message) => {
        console.log("LOGGING TO SERVER:", message);
        // In a real app, this would be a fetch call to a logging endpoint.
        // fetch('/api/log', { method: 'POST', body: JSON.stringify(message) });
        // For this demo, we will simulate the email logging to ceo@40wallst.com
        console.log(`SIMULATING EMAIL TO ceo@40wallst.com: ${JSON.stringify(message)}`);
    };

    const handleFileUpload = async (files) => {
        setAppState('analyzing');
        logToServer({ event: 'analysis_started', fileCount: files.length, fileNames: files.map(f => f.name) });

        // This is a simplified simulation of reading files and getting a text representation.
        // In a real implementation, you would use libraries to parse PDF, XLSX, etc.
        const fileContents = await Promise.all(files.map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(`File: ${file.name}\n\n${e.target.result.substring(0, 2000)}...`);
                reader.readAsText(file);
            });
        }));

        const prompt = `Analyze the following financial documents for a business funding application. Extract the business name, calculate the average monthly deposit, and estimate a hyper-potential funding capacity based on 13% of that average. Provide a brief summary of insights and risks. \n\n${fileContents.join('\n\n')}`;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // In a real app, you would parse this text to structure the data.
            // For now, we'll use mock data based on a hypothetical analysis.
            const avgMonthlyDeposit = 115384; // Mock value
            const fundingCapacity = avgMonthlyDeposit * 0.13;

            const mockData = {
                businessName: "QuantumLeap Tech", // Assume extracted
                fundingCapacity: fundingCapacity,
                insights: ["Strong monthly revenue", "Consistent cash flow"],
                risks: ["High dependency on a single client"],
                chartData: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [
                        {
                            label: 'Revenue',
                            data: [120000, 110000, 130000, 105000, 125000, 102000],
                            backgroundColor: 'rgba(0, 39, 102, 0.8)',
                        },
                        {
                            label: 'Expenses',
                            data: [80000, 75000, 85000, 70000, 82000, 72000],
                            backgroundColor: 'rgba(23, 168, 255, 0.8)',
                        },
                    ],
                },
            };
            setAnalysisData(mockData);
            const initialMessage = { role: 'model', parts: [{ text: `Based on the documents, here is the initial analysis for ${mockData.businessName}.` }] };
            setChatHistory([initialMessage]);
            logToServer({ event: 'analysis_complete', result: mockData });
            setAppState('dashboard');
            speechManager.speak(initialMessage.parts[0].text, () => setIsSpeaking(false));
            setIsSpeaking(true);
        } catch (error) {
            console.error("Error analyzing files:", error);
            logToServer({ event: 'analysis_error', error: error.message });
            setAppState('landing'); // Reset on error
        }
    };

    const handleSendMessage = async (message) => {
        const newMessage = { role: 'user', parts: [{ text: message }] };
        setChatHistory(prev => [...prev, newMessage]);
        logToServer({ event: 'user_message', message });

        try {
            const chat = model.startChat({
                history: chatHistory,
            });
            const result = await chat.sendMessage(message);
            const response = await result.response;
            const text = response.text();
            const aiResponse = { role: 'model', parts: [{ text }] };
            setChatHistory(prev => [...prev, aiResponse]);
            logToServer({ event: 'ai_response', response: text });
        } catch (error) {
            console.error("Error sending message:", error);
            logToServer({ event: 'ai_error', error: error.message });
            const errorResponse = { role: 'model', parts: [{ text: "I encountered an error. Please try again." }] };
            setChatHistory(prev => [...prev, errorResponse]);
        }
    };

    const handleReset = () => {
        setAppState('landing');
        setAnalysisData(null);
        setChatHistory([]);
        speechManager.stop();
        setIsSpeaking(false);
        localStorage.removeItem('mnemoAppState');
    };

    const handlePlaybackControl = (action) => {
        if (action === 'play') {
            const lastMessage = chatHistory.filter(m => m.role === 'model').pop();
            if (lastMessage) {
                speechManager.speak(lastMessage.parts[0].text, () => setIsSpeaking(false));
                setIsSpeaking(true);
            }
        } else if (action === 'pause') {
            speechManager.pause();
            setIsSpeaking(false);
        } else if (action === 'stop') {
            speechManager.stop();
            setIsSpeaking(false);
        }
    };

    return (
        <div className="min-h-screen bg-quantum-bg text-quantum-text-dark">
            {appState === 'landing' && <LandingPage onFileUpload={handleFileUpload} />}
            {appState === 'analyzing' && <AnalysisAnimation />}
            {appState === 'dashboard' && analysisData && (
                <DashboardView
                    data={analysisData}
                    chatHistory={chatHistory}
                    onSendMessage={handleSendMessage}
                    onReset={handleReset}
                    isSpeaking={isSpeaking}
                    onPlaybackControl={handlePlaybackControl}
                />
            )}
        </div>
    );
};

// --- Landing Page Component ---
const LandingPage = ({ onFileUpload }) => {
    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileSelect = (event) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            onFileUpload(Array.from(files));
        }
    };

    const handleDragEnter = (event) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (event) => {
        event.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            onFileUpload(Array.from(files));
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center animate-fade-in">
            <h1 className="text-5xl font-bold text-quantum-primary-light mb-4 animate-slide-in-up" style={{animationDelay: '100ms'}}>Mnemo</h1>
            <p className="text-xl text-quantum-text-light mb-8 animate-slide-in-up" style={{animationDelay: '200ms'}}>Your AI-Powered Business Funding Co-Pilot</p>
            <div
                className={`w-full max-w-2xl p-10 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-300 ${isDragging ? 'border-quantum-secondary scale-105 bg-quantum-surface' : 'border-quantum-border hover:bg-quantum-surface'}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
            >
                <p className="text-lg">Drag & drop your financial documents here</p>
                <p className="text-sm text-quantum-text-light mt-2">PDF, TXT, XLSX, CSV accepted</p>
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple className="hidden" accept=".pdf,.txt,.xlsx,.csv" />
            </div>
        </div>
    );
};

// --- Analysis Animation ---
const AnalysisAnimation = () => (
    <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
            <div className="w-16 h-16 border-4 border-t-quantum-primary-light border-r-quantum-primary-light border-b-quantum-primary-light border-l-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-lg">Analyzing your documents...</p>
        </div>
    </div>
);

// --- Dashboard View ---
const DashboardView = ({ data, chatHistory, onSendMessage, onReset, isSpeaking, onPlaybackControl }) => {
    return (
        <div className="flex h-screen p-4 gap-4">
            {/* Left Column: Chat */}
            <div className="w-1/3 flex flex-col bg-quantum-surface rounded-lg p-4 glassmorphism">
                <h2 className="text-2xl font-bold mb-4 text-quantum-primary-light">Conversation</h2>
                <div className="flex-grow overflow-y-auto pr-2">
                    {chatHistory.map((msg, index) => (
                        <div key={index} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                            <p className={`p-3 rounded-lg inline-block ${msg.role === 'user' ? 'bg-quantum-primary text-white' : 'bg-quantum-bg'}`}>
                                {msg.parts[0].text}
                            </p>
                        </div>
                    ))}
                </div>
                <ChatInput onSendMessage={onSendMessage} isSpeaking={isSpeaking} onPlaybackControl={onPlaybackControl} />
            </div>

            {/* Right Column: Data */}
            <div className="w-2/3 bg-quantum-surface rounded-lg p-6 overflow-y-auto glassmorphism">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-white">{data.businessName}</h1>
                    <div>
                        <button onClick={() => window.print()} className="px-4 py-2 bg-quantum-primary-light text-white rounded-lg mr-2">Print / Save PDF</button>
                        <button onClick={onReset} className="px-4 py-2 bg-quantum-error text-white rounded-lg">New Analysis</button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    <MetricCard title="Hyper-Potential Funding Capacity" value={`$${data.fundingCapacity.toLocaleString()}`} />
                    {/* Add more metric cards as needed */}
                </div>
                <div className="mb-6">
                    <h3 className="text-xl font-bold mb-2">Financials</h3>
                    <StockMarketChart data={data.chartData} />
                </div>
                <div>
                    <h3 className="text-xl font-bold mb-2">Insights</h3>
                    <ul className="list-disc list-inside">
                        {data.insights.map((insight, i) => <li key={i}>{insight}</li>)}
                    </ul>
                </div>
                 <div>
                    <h3 className="text-xl font-bold mb-2 mt-4">Risks</h3>
                    <ul className="list-disc list-inside">
                        {data.risks.map((risk, i) => <li key={i}>{risk}</li>)}
                    </ul>
                </div>
            </div>
        </div>
    );
};

const ChatInput = ({ onSendMessage, isSpeaking, onPlaybackControl }) => {
    const [message, setMessage] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (message.trim()) {
            onSendMessage(message);
            setMessage('');
        }
    };

    return (
        <div className="mt-4">
            <div className="flex items-center bg-quantum-bg border border-quantum-border rounded-lg p-2">
                <button onClick={() => onPlaybackControl('play')} disabled={isSpeaking} className="p-2 text-quantum-primary-light disabled:text-gray-500">Play</button>
                <button onClick={() => onPlaybackControl('pause')} disabled={!isSpeaking} className="p-2 text-quantum-primary-light disabled:text-gray-500">Pause</button>
                <button onClick={() => onPlaybackControl('stop')} className="p-2 text-quantum-primary-light">Stop</button>
            </div>
            <form onSubmit={handleSubmit} className="mt-2">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full p-3 bg-quantum-bg border border-quantum-border rounded-lg"
                    placeholder="Ask a follow-up question..."
                />
            </form>
        </div>
    );
};

const MetricCard = ({ title, value }) => (
    <div className="bg-quantum-bg p-4 rounded-lg">
        <h4 className="text-sm text-quantum-text-light">{title}</h4>
        <p className="text-2xl font-bold text-white">{value}</p>
    </div>
);

const StockMarketChart = ({ data }) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }
        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#e2e8ff'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#e2e8ff'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8ff'
                        }
                    }
                }
            }
        });
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [data]);

    return <div style={{height: '400px'}}><canvas ref={chartRef}></canvas></div>;
};


const root = createRoot(document.getElementById('root'));
root.render(<MnemoApp />);
