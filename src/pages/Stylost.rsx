import Navbar from "../components/Navbar";

function Stylist() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="page">
        <div className="page-header">
          <div>
            <div className="eyebrow">AI styling</div>
            <h1 className="page-title">Stylist</h1>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Stylist;