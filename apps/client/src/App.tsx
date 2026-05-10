import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import EntryList from './components/EntryList';
import EntryForm from './components/EntryForm';
import EntryDetail from './components/EntryDetail';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<EntryList />} />
        <Route path="/entries/new" element={<EntryForm />} />
        <Route path="/entries/:id/edit" element={<EntryForm />} />
        <Route path="/entries/:id" element={<EntryDetail />} />
      </Routes>
    </Layout>
  );
}
