import psycopg2
import os
from dotenv import load_dotenv
load_dotenv("passwordDB.env")
conn = psycopg2.connect(
    host=os.getenv("HOST"),
    database=os.getenv("DATABASE"),
    user=os.getenv("USER"),
    password=os.getenv("DB_PASSWORD")
)
cur=conn.cursor()
def create_table():
    try:
        cur.execute('''CREATE TABLE IF NOT EXISTS expense_calv3 (
                        id SERIAL PRIMARY KEY,
                        expense VARCHAR(100) NOT NULL,
                        amount NUMERIC(10,2) NOT NULL
                    )''')
        conn.commit()
        print("Table created successfully.")
    except psycopg2.Error as e:
        print(f"Error creating table: {e}")
        conn.rollback()
def add_expense():
    try:
        expense = input("Enter the expense name: ")
        try:
            amount = float(input("Enter the expense amount: "))
        except ValueError:
            print("Invalid amount. Please enter a valid number.")
            return
        cur.execute("INSERT INTO expense_calv3 (expense,amount) VALUES (%s, %s)", (expense, amount))
        conn.commit()
        print("Expense added successfully")
    except psycopg2.Error as e:
        print(f"Error adding expense: {e}")
        conn.rollback()
def delete_expense():
    try:
        expense_id = int(input("Enter the expense ID to delete: "))
        cur.execute("SELECT * FROM expense_calv3 WHERE id = %s", (expense_id,))
        expenses = cur.fetchone()
        if expenses is None:
            print("Expense not found")
        else:
            cur.execute("DELETE FROM expense_calv3 WHERE id = %s", (expense_id,))
            conn.commit()
            print("Expense deleted successfully")
    except ValueError as e:
        print(f"Error deleting expense: {e}")
    except psycopg2.Error as e:
        print(f"Error deleting expense: {e}")
        conn.rollback()
def view_expenses():
    try:
        cur.execute("SELECT * FROM expense_calv3")
        expenses = cur.fetchall()
    except psycopg2.Error as e:
        return f"Error viewing expenses: {str(e)}"
    if expenses is None or len(expenses) == 0:
        print("No expenses found")
    else:
        print("Expenses: ")
        for expense in expenses:
            print(f" ID: {expense[0]} | Name: {expense[1]} | Amount: {expense[2]}\n")
def update_expense():
    try:
        expense_id = int(input("Enter the expense ID to update: "))
    except ValueError:
        print("Invalid ID. Please enter a valid number.")
        return
    cur.execute("SELECT * FROM expense_calv3 WHERE id = %s", (expense_id,))
    expenses = cur.fetchone()
    if expenses is None:
        print("Expense not found")
    else:
        new_expense = input("Enter the new expense name: ")
        try:
            new_amount = float(input("Enter the new expense amount: "))
        except ValueError:
            print("Invalid amount. Please enter a valid number.")
            return
        cur.execute("UPDATE expense_calv3 SET expense = %s, amount = %s WHERE id = %s", (new_expense, new_amount, expense_id))
        conn.commit()
        print("Expense updated successfully")
def average_expense():
    try: 
        cur.execute("SELECT AVG(amount) FROM expense_calv3")
        avg = cur.fetchone()
        if avg is None:
            print("No expenses found")
        else:
            print(f"Average expense amount: {avg[0]:.2f}")
    except psycopg2.Error as e:
        print(f"Error calculating average expense: {e}")
def total_expense():
    try:
        cur.execute("SELECT SUM(amount) FROM expense_calv3")
        total = cur.fetchone()
        if total is None:
            print("No expenses found")
        else:
            print(f"Total expense amount: {total[0]:.2f}")
    except psycopg2.Error as e:
        print(f"Error calculating total expense: {e}")
        max_expense = cur.fetchall()
        if not max_expense:
            print("No expenses found")
        else:
            print(f"Maximum expense(s): \n ID: {max_expense[0]} | Name: {max_expense[1]} | Amount: {max_expense[2]}")
def max_expense():
    try:
        cur.execute("SELECT * FROM expense_calv3 WHERE amount = (SELECT MAX(amount) FROM expense_calv3)")
        max_expense = cur.fetchall()
        if not max_expense:
            print("No expenses found")
            return
    except psycopg2.Error as e:
        print(f"Error finding maximum expense: {e}")
        return
    else:
        for expense in max_expense:
            print(f"Maximum expense(s): \n ID: {expense[0]} | Name: {expense[1]} | Amount: {expense[2]}")
def min_expense():
    try:
        cur.execute("SELECT * FROM expense_calv3 WHERE amount = (SELECT MIN(amount) FROM expense_calv3)")
        min_expense = cur.fetchall()
        if not min_expense:
            print("No expenses found")
    except psycopg2.Error as e:
        print(f"Error finding minimum expense: {e}")
    else:
        for expense in min_expense:
            print(f"Minimum expense(s): \n ID: {expense[0]} | Name: {expense[1]} | Amount: {expense[2]}")
def search_expense():
    search_term = input("Enter the expense name to search: ")
    cur.execute("SELECT * FROM expense_calv3 WHERE expense ILIKE %s", (f"%{search_term}%",))
    expenses = cur.fetchall()
    if not expenses:
        print("No expenses found")
    else:
        print("Search results: ")
        for expense in expenses:
            print(f" ID: {expense[0]} | Name: {expense[1]} | Amount: {expense[2]}\n")
def main():
    while True:
        print("\nExpense Calculator Menu:")
        print("1. Add Expense")
        print("2. Delete Expense")
        print("3. View Expenses")
        print("4. Update Expense")
        print("5. Average Expenses")
        print("6. Total Expenses")
        print("7. Maximum Expense")
        print("8. Minimum Expense")
        print("9. Search an Expense")
        print("10. Exit\n")

        choice = input("Enter your choice (1-10): ")

        if choice == '1':
            add_expense()
        elif choice == '2':
            delete_expense()
        elif choice == '3':
            view_expenses()
        elif choice == '4':
            update_expense()
        elif choice == '5':
            average_expense()
        elif choice == '6':
            total_expense()
        elif choice == '7':
            max_expense()
        elif choice == '8':
            min_expense()
        elif choice == '9':
            search_expense()
        elif choice == '10':
            break
        else:
            print("Invalid choice! Please try again.")
if __name__ == "__main__":
    create_table()
    main()
    cur.close()
    conn.close()
