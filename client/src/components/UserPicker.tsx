interface UserPickerProps {
  onSelectUser: (user: string) => void;
}

function UserPicker({ onSelectUser }: UserPickerProps) {
  function selectUser(user: string) {
    localStorage.setItem("dualrep-user", user);
    onSelectUser(user);
  }

  return (
    <main className="app">
      <section className="user-picker panel-enter" aria-labelledby="user-picker-title">
        <div className="logo" aria-hidden="true">
          💪
        </div>

        <h1 id="user-picker-title">DualRep</h1>
        <p>Push together. Stay consistent.</p>

        <h2>Who are you?</h2>

        <div className="user-buttons">
          <button type="button" onClick={() => selectUser("Damian")}>
            Damian
          </button>

          <button type="button" onClick={() => selectUser("Icefox")}>
            Icefox
          </button>
        </div>
      </section>
    </main>
  );
}

export default UserPicker;
