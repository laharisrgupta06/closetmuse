import Navbar from "../components/Navbar";

function OutfitBuilder() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="page">
        <div className="page-header">
          <div>
            <div className="eyebrow">Create</div>
            <h1 className="page-title">Outfit Builder</h1>
          </div>
        </div>
      </main>
    </div>
  );
}

export default OutfitBuilder;